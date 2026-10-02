/**
 * Edits to the graph, as functions over a draft course (see store.update).
 *
 * The order of the edges in the file is part of their meaning -- the first
 * edge whose condition holds is the one taken -- so these keep it: a new edge
 * goes in before the fallback, and reordering only moves an edge among the
 * edges of its own node, leaving every other edge where it was.
 */
import type { Condition, Course, CourseEdge, CourseNode, NodeType } from "../schema/types";
import { emptyLoc, isJudge, newNode, nextId, NODE_TYPES } from "./nodeTypes";
import { keysOfNode } from "./keys";

const ids = (c: Course) => c.nodes.map((n) => n.id);

export const outgoingIndexes = (c: Course, from: string): number[] =>
  c.edges.map((e, i) => (e.from === from ? i : -1)).filter((i) => i !== -1);

export function addNode(c: Course, type: NodeType, langs: string[], section?: number): string {
  const id = nextId(type, ids(c));
  const node = newNode(type, id, langs);
  if (section && section > 1) node.section = section;
  c.nodes.push(node);
  return id;
}

/** A sensible first condition for an edge that is not the fallback: the first key the source produces. */
const defaultWhen = (c: Course, from: string): Condition | undefined => {
  const node = c.nodes.find((n) => n.id === from);
  if (!node) return undefined;
  const key = keysOfNode(node, c.info["source-language"])[0];
  if (!key) return undefined;
  if (key.scale === "bool") return { key: key.key, operator: "eq", value: true };
  if (key.scale === "option" && key.options?.length) return { key: key.key, operator: "eq", value: key.options[0] };
  if (key.scale === "percent") return { key: key.key, operator: "gte", value: 70 };
  if (key.scale === "unit") return { key: key.key, operator: "gte", value: 0.5 };
  if (key.scale === "level") return { key: key.key, operator: "gte", value: Math.max(0, (key.levels ?? 2) - 2) };
  if (["count", "points"].includes(key.scale)) return { key: key.key, operator: "gte", value: 1 };
  return { key: key.key, operator: "contains", value: "" };
};

/**
 * A new edge. When the node already has a fallback, the new one goes in just
 * before it, with a first condition to edit -- otherwise it would be a second
 * fallback that can never be taken.
 */
export function connect(c: Course, from: string, to: string): number {
  const out = outgoingIndexes(c, from);
  const fallback = out.find((i) => !c.edges[i].when);
  if (fallback === undefined) {
    c.edges.push({ from, to });
    return c.edges.length - 1;
  }
  const when = defaultWhen(c, from);
  const edge: CourseEdge = when ? { from, to, when } : { from, to };
  c.edges.splice(fallback, 0, edge);
  return fallback;
}

/** Moves one of a node's edges up or down among that node's edges only. */
export function reorderEdge(c: Course, from: string, position: number, to: number) {
  const slots = outgoingIndexes(c, from);
  if (to < 0 || to >= slots.length || position === to) return;
  const list = slots.map((i) => c.edges[i]);
  const [moved] = list.splice(position, 1);
  list.splice(to, 0, moved);
  slots.forEach((slot, i) => (c.edges[slot] = list[i]));
}

export function deleteEdges(c: Course, indexes: number[]) {
  const drop = new Set(indexes);
  c.edges = c.edges.filter((_, i) => !drop.has(i));
}

export function deleteNodes(c: Course, remove: string[]) {
  const drop = new Set(remove);
  c.nodes = c.nodes.filter((n) => !drop.has(n.id));
  c.edges = c.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to));
  if (drop.has(c.info.start)) {
    const first = c.nodes.find((n) => !isJudge(n.type));
    if (first) c.info.start = first.id;
  }
}

/** Copies of nodes, with the edges between them; ids are the next free ones. */
export function duplicateNodes(c: Course, copy: string[]): Record<string, string> {
  const nodes = copy.map((id) => c.nodes.find((n) => n.id === id)).filter((n): n is CourseNode => !!n);
  return pasteNodes(c, nodes, c.edges);
}

/**
 * Adds pasted nodes (and the edges between them) under fresh ids. Inside the
 * group, references follow the new ids -- a judge pasted with its form reads
 * the new form -- while those to nodes left behind stay as they were. Nodes
 * may come from another course: a section this one does not have is dropped.
 */
export function pasteNodes(c: Course, nodes: CourseNode[], edges: CourseEdge[]): Record<string, string> {
  const map: Record<string, string> = {};
  const sections = new Set([1, ...(c.info?.sections ?? []).map((s) => s?.number), ...c.nodes.map((n) => n.section ?? 1)]);
  const added: CourseNode[] = [];
  for (const node of nodes) {
    if (!node || !NODE_TYPES.includes(node.type)) continue;
    const fresh = structuredClone(node);
    fresh.id = nextId(node.type, ids(c));
    if (fresh.section !== undefined && !sections.has(fresh.section)) delete fresh.section;
    map[node.id] = fresh.id;
    c.nodes.push(fresh);
    added.push(fresh);
  }
  const renamed = (id: string) => (Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined);
  const links = edges.filter((e) => e && renamed(e.from) && renamed(e.to)).map((e) => ({ ...structuredClone(e), from: map[e.from], to: map[e.to] }));
  renameRefs(added, links, renamed);
  c.edges.push(...links);
  return map;
}

/** A node's new id, or undefined when it keeps its own. */
type Rename = (id: string) => string | undefined;

const replaceKeyRefs = (text: string, rename: Rename) =>
  text.replace(/(\{\{\s*STORAGE:\s*)([a-z]+[0-9]+)(\.[a-z0-9-]+\s*\}\})/g, (m, a, id, b) => {
    const to = rename(id);
    return to ? `${a}${to}${b}` : m;
  });

const renameInCondition = (when: Condition | undefined, rename: Rename): void => {
  if (!when) return;
  if ("and" in when) return when.and.forEach((w) => renameInCondition(w, rename));
  if ("or" in when) return when.or.forEach((w) => renameInCondition(w, rename));
  if (typeof when.key !== "string") return;
  const dot = when.key.indexOf(".");
  const to = dot > 0 ? rename(when.key.slice(0, dot)) : undefined;
  if (to) when.key = to + when.key.slice(dot);
};

/** Points the references in nodes and edges -- conditions, `from`, {{STORAGE}} -- at renamed nodes; all at once, so no rename feeds another. */
function renameRefs(nodes: CourseNode[], edges: CourseEdge[], rename: Rename) {
  for (const e of edges) renameInCondition(e.when, rename);
  for (const n of nodes) {
    const content = n.content ?? {};
    if (typeof content.from === "string") content.from = rename(content.from) ?? content.from;
    if (Array.isArray(content.prompt)) for (const p of content.prompt) p.text = replaceKeyRefs(p.text ?? "", rename);
    if (content.state && typeof content.state === "object")
      for (const [k, v] of Object.entries(content.state))
        content.state[k] = Array.isArray(v) ? v.map((x) => replaceKeyRefs(String(x), rename)) : replaceKeyRefs(String(v), rename);
    if (Array.isArray(content.items))
      for (const item of content.items)
        if (typeof item?.instructions === "string") item.instructions = replaceKeyRefs(item.instructions, rename);
  }
}

/** Renames a node and every reference to it: edges, start, from, conditions and {{STORAGE}}. */
export function renameNode(c: Course, oldId: string, newId: string) {
  if (oldId === newId || ids(c).includes(newId)) return false;
  const node = c.nodes.find((n) => n.id === oldId);
  if (!node) return false;
  node.id = newId;
  if (c.info.start === oldId) c.info.start = newId;
  for (const e of c.edges) {
    if (e.from === oldId) e.from = newId;
    if (e.to === oldId) e.to = newId;
  }
  renameRefs(c.nodes, c.edges, (id) => (id === oldId ? newId : undefined));
  return true;
}

export const newLoc = emptyLoc;
