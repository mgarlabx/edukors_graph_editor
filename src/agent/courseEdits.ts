/**
 * What the agent reads of a course and how it changes one, as functions over
 * plain data: editorTools.ts runs them against the course on screen, through
 * the store, so that a change is validated and undone like any other.
 *
 * A list of operations is applied all or nothing: the first one that cannot
 * be applied throws, naming it, and the caller keeps the course it had.
 */
import type { Condition, Course, CourseEdge, CourseNode, Loc, NodeType } from "../schema/types";
import { NODE_TYPES, PREFIX, nextId } from "../course/nodeTypes";
import { deleteNodes, outgoingIndexes, renameNode } from "../course/ops";
import { keysOfCourse, scaleLabel } from "../course/keys";
import { localize } from "../course/localize";
import { addLanguage, LANG_RE, makeSource, removeLanguage, renameLanguage } from "../i18n/languages";
import type { Diagnostics, Issue } from "../validate";
import type { Position } from "../store/layout";

export type Operation =
  | { op: "add_node"; node: { id?: string; type: NodeType; section?: number; title?: Loc; content?: Record<string, unknown> }; near?: string }
  | { op: "update_node"; id: string; title?: Loc; content?: Record<string, unknown>; section?: number | null }
  | { op: "delete_node"; id: string }
  | { op: "rename_node"; id: string; new_id: string }
  | { op: "set_edges"; from: string; edges: { to: string; when?: Condition }[] }
  | { op: "update_info"; info: Record<string, unknown> };

export interface Applied {
  /** one line per operation, for the agent */
  changes: string[];
  /** the nodes added, with the node each was asked to be placed beside */
  added: { id: string; near?: string }[];
}

export class EditError extends Error {}

/** The info fields a course may go without. */
const OPTIONAL_INFO = new Set(["description", "sections", "system-prompt", "extras"]);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isLoc = (v: unknown): v is Loc => Array.isArray(v) && v.every((e) => isObject(e) && typeof e.lang === "string" && typeof e.text === "string");

/** Applies the operations to `course`, a draft. Throws EditError, naming the operation, when one cannot be applied. */
export function applyOperations(course: Course, operations: Operation[]): Applied {
  if (!Array.isArray(operations) || operations.length === 0) throw new EditError("No operations to apply.");
  const applied: Applied = { changes: [], added: [] };
  operations.forEach((op, i) => {
    try {
      applied.changes.push(applyOne(course, op, applied));
    } catch (e) {
      const what = isObject(op) ? [op.op, "id" in op ? op.id : "from" in op ? op.from : "node" in op && isObject(op.node) ? op.node.id ?? op.node.type : ""].filter(Boolean).join(" ") : "?";
      throw new EditError(`Operation ${i + 1} (${what}): ${(e as Error).message} Nothing was changed.`);
    }
  });
  return applied;
}

function nodeOf(course: Course, id: unknown): CourseNode {
  const node = course.nodes.find((n) => n.id === id);
  if (!node) throw new EditError(`there is no node ${String(id)}.`);
  return node;
}

function applyOne(course: Course, op: Operation, applied: Applied): string {
  switch (op?.op) {
    case "add_node": {
      const spec = op.node;
      if (!isObject(spec) || !NODE_TYPES.includes(spec.type)) throw new EditError(`the type must be one of ${NODE_TYPES.join(", ")}.`);
      const taken = course.nodes.map((n) => n.id);
      let id = spec.id;
      if (id === undefined || id === "") id = nextId(spec.type, taken);
      else if (!new RegExp(`^${PREFIX[spec.type]}[0-9]+$`).test(id)) throw new EditError(`a ${spec.type} id is ${PREFIX[spec.type]} and a number (${nextId(spec.type, taken)}).`);
      else if (taken.includes(id)) throw new EditError(`${id} is taken; the next free one is ${nextId(spec.type, taken)}.`);
      if (spec.title !== undefined && !isLoc(spec.title)) throw new EditError("title must be a list of { lang, text }.");
      if (spec.content !== undefined && !isObject(spec.content)) throw new EditError("content must be an object.");
      if (spec.section !== undefined && !Number.isInteger(spec.section)) throw new EditError("section must be a whole number.");
      if (op.near !== undefined) nodeOf(course, op.near);
      const node = { id, type: spec.type } as CourseNode;
      if (spec.section !== undefined) node.section = spec.section;
      node.title = spec.title ?? [{ lang: course.info["source-language"], text: "" }];
      node.content = spec.content ?? {};
      course.nodes.push(node);
      applied.added.push({ id, near: op.near });
      return `added ${id} (${spec.type})`;
    }
    case "update_node": {
      const node = nodeOf(course, op.id);
      const changed: string[] = [];
      if (op.title !== undefined) {
        if (!isLoc(op.title)) throw new EditError("title must be a list of { lang, text }.");
        node.title = op.title;
        changed.push("title");
      }
      if (op.content !== undefined) {
        if (!isObject(op.content)) throw new EditError("content must be an object.");
        node.content = op.content;
        changed.push("content");
      }
      if (op.section === null) {
        delete node.section;
        changed.push("section");
      } else if (op.section !== undefined) {
        if (!Number.isInteger(op.section)) throw new EditError("section must be a whole number or null.");
        node.section = op.section;
        changed.push("section");
      }
      if (!changed.length) throw new EditError("nothing to change: give title, content or section.");
      return `updated ${node.id} (${changed.join(", ")})`;
    }
    case "delete_node": {
      nodeOf(course, op.id);
      const edges = course.edges.filter((e) => e.from === op.id || e.to === op.id).length;
      const wasStart = course.info.start === op.id;
      deleteNodes(course, [op.id]);
      return `deleted ${op.id}${edges ? ` and its ${edges} edge${edges > 1 ? "s" : ""}` : ""}${wasStart ? `; the start is now ${course.info.start}` : ""}`;
    }
    case "rename_node": {
      const node = nodeOf(course, op.id);
      const prefix = PREFIX[node.type];
      if (!new RegExp(`^${prefix}[0-9]+$`).test(op.new_id)) throw new EditError(`a ${node.type} id is ${prefix} and a number.`);
      if (course.nodes.some((n) => n.id === op.new_id)) throw new EditError(`${op.new_id} is taken.`);
      renameNode(course, op.id, op.new_id);
      return `renamed ${op.id} to ${op.new_id}`;
    }
    case "set_edges": {
      nodeOf(course, op.from);
      if (!Array.isArray(op.edges)) throw new EditError("edges must be a list.");
      const slots = outgoingIndexes(course, op.from);
      // An edge set again to where one went before keeps that one's extras: the same condition first, else the first left.
      const old = slots.map((i) => course.edges[i]).filter((e) => e.extras);
      const take = (match: (e: CourseEdge) => boolean) => {
        const at = old.findIndex(match);
        return at === -1 ? undefined : old.splice(at, 1)[0].extras;
      };
      const extrasFor = (to: string, when: unknown) =>
        take((e) => e.to === to && JSON.stringify(e.when) === JSON.stringify(when)) ?? take((e) => e.to === to);
      const fresh: CourseEdge[] = op.edges.map((e, k) => {
        if (!isObject(e)) throw new EditError(`edge ${k + 1} is not an object.`);
        nodeOf(course, e.to);
        if (e.when !== undefined && !isObject(e.when)) throw new EditError(`edge ${k + 1}: when must be a condition object.`);
        const edge: CourseEdge = e.when === undefined ? { from: op.from, to: e.to } : { from: op.from, to: e.to, when: e.when };
        const extras = extrasFor(e.to, e.when);
        return extras ? { ...edge, extras } : edge;
      });
      // The node's edges stay where they were in the file, so the order of everyone else's is untouched.
      const at = slots.length ? slots[0] : course.edges.length;
      const drop = new Set(slots);
      const before = course.edges.slice(0, at).filter((_, i) => !drop.has(i));
      const after = course.edges.slice(at).filter((_, i) => !drop.has(i + at));
      course.edges = [...before, ...fresh, ...after];
      return fresh.length ? `set the ${fresh.length} edge${fresh.length > 1 ? "s" : ""} leaving ${op.from}: ${fresh.map((e) => `→ ${e.to}${e.when ? " (when …)" : " (fallback)"}`).join(", ")}` : `removed the edges leaving ${op.from}`;
    }
    case "update_info":
      return updateInfo(course, op.info);
    default:
      throw new EditError(`unknown operation; use add_node, update_node, delete_node, rename_node, set_edges or update_info.`);
  }
}

function updateInfo(course: Course, info: Record<string, unknown>): string {
  if (!isObject(info) || !Object.keys(info).length) throw new EditError("info must name at least one field.");
  const set: string[] = [];
  const target = course.info as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(info)) {
    if (value === null) {
      if (!OPTIONAL_INFO.has(key)) throw new EditError(`${key} cannot be removed.`);
      delete target[key];
      set.push(`removed ${key}`);
      continue;
    }
    switch (key) {
      case "course-id":
        if (target[key] && value !== target[key]) throw new EditError("the course-id identifies the course and is kept.");
        target[key] = value;
        break;
      case "start":
        nodeOf(course, value);
        target.start = value;
        break;
      case "source-language": {
        const lang = String(value);
        const old = course.info["source-language"];
        if (!LANG_RE.test(lang)) throw new EditError(`${lang} is not a language code (pt, en, pt-BR…).`);
        if (lang === old) break;
        // Another of the course's languages becomes the source, or the source is renamed (pt → pt-BR).
        if (course.info["other-languages"].includes(lang)) makeSource(course, lang);
        else renameLanguage(course, old, lang);
        break;
      }
      case "other-languages": {
        if (!Array.isArray(value) || !value.every((l) => typeof l === "string" && LANG_RE.test(l))) throw new EditError("other-languages must be a list of language codes.");
        const wanted = (value as string[]).filter((l) => l !== course.info["source-language"]);
        for (const lang of course.info["other-languages"].filter((l) => !wanted.includes(l))) removeLanguage(course, lang);
        for (const lang of wanted) addLanguage(course, lang);
        course.info["other-languages"] = wanted.filter((l, i) => wanted.indexOf(l) === i);
        break;
      }
      default:
        target[key] = value;
    }
    set.push(key);
  }
  return `info: ${set.join(", ")}`;
}

// ------------------------------------------------------------- reading ----

/** The course in outline: everything but the content of the nodes. */
export function outline(course: Course) {
  const lang = course.info?.["source-language"] ?? "en";
  return {
    info: course.info,
    nodes: (course.nodes ?? []).map((n) => ({ id: n.id, type: n.type, ...(n.section !== undefined ? { section: n.section } : {}), title: localize(n.title, lang) })),
    edges: (course.edges ?? []).map((e, i) => ({ i, ...e })),
    keys: keysOfCourse(course, lang).map((k) => `${k.key}: ${scaleLabel(k)}${k.ai ? " (from the AI)" : ""}`),
  };
}

/** Some nodes in full, with the edges into and out of them. */
export function nodesInFull(course: Course, ids: string[]) {
  const missing = ids.filter((id) => !course.nodes.some((n) => n.id === id));
  if (missing.length) throw new EditError(`There is no node ${missing.join(", ")}. The nodes are: ${course.nodes.map((n) => n.id).join(", ")}.`);
  const wanted = new Set(ids);
  return {
    nodes: course.nodes.filter((n) => wanted.has(n.id)),
    edges: course.edges.map((e, i) => ({ i, ...e })).filter((e) => wanted.has(e.from) || wanted.has(e.to)),
  };
}

const issueLine = (i: Issue) => `${i.level === "error" ? "ERROR" : "WARNING"} ${i.where}: ${i.message}`;

/** The problems of a course, for the agent: the counts, then each one, errors first. */
export function problems(d: Diagnostics | null, limit = 40): string {
  if (!d) return "Not validated.";
  if (!d.issues.length) return "Valid: no errors, no warnings.";
  const lines = d.issues.slice(0, limit).map(issueLine);
  if (d.issues.length > limit) lines.push(`… and ${d.issues.length - limit} more.`);
  return `${d.errors} error${d.errors === 1 ? "" : "s"}, ${d.warnings} warning${d.warnings === 1 ? "" : "s"}:\n${lines.join("\n")}`;
}

// ------------------------------------------------------------- placing ----

const STEP_X = 260;
const STEP_Y = 200;
const crowds = (taken: Position[], p: Position) => taken.some((q) => Math.abs(q.x - p.x) < 240 && Math.abs(q.y - p.y) < 110);

/**
 * Where nodes the agent added go on the canvas: below the node they were
 * placed near, or the one an edge reaches them from, else below
 * everything; moved right until they overlap nothing.
 */
export function placeAdded(course: Course, positions: Record<string, Position>, added: Applied["added"]): Record<string, Position> {
  const placed: Record<string, Position> = {};
  const taken = () => [...Object.values(positions), ...Object.values(placed)];
  const all = Object.values(positions);
  const bottom = all.length ? Math.max(...all.map((p) => p.y)) + STEP_Y : 0;
  const left = all.length ? Math.min(...all.map((p) => p.x)) : 0;
  for (const { id, near } of added) {
    if (positions[id] || !course.nodes.some((n) => n.id === id)) continue;
    const from = near ?? course.edges.find((e) => e.to === id && (positions[e.from] || placed[e.from]))?.from;
    const anchor = from ? positions[from] ?? placed[from] : undefined;
    const p = anchor ? { x: anchor.x, y: anchor.y + STEP_Y } : { x: left, y: bottom };
    while (crowds(taken(), p)) p.x += STEP_X;
    placed[id] = p;
  }
  return placed;
}
