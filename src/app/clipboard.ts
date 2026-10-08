/**
 * Cutting, copying and pasting nodes, through the system clipboard -- within a
 * course, or from one tab to another. What is copied says where it came from:
 * the tab and the languages of its course; each node carries where it sat. So
 * a paste in another course keeps their arrangement and speaks that course's
 * languages.
 */
import { courseLangs, useEditor } from "../store/editor";
import { deleteEdges, deleteNodes, pasteNodes } from "../course/ops";
import { fitLanguages } from "../i18n/languages";
import { NODE_TYPES } from "../course/nodeTypes";
import { canvasView } from "../canvas/view";
import { sizeOf } from "../canvas/elk";
import { positionsOf, type Position } from "../store/layout";
import type { Course, CourseEdge, CourseNode } from "../schema/types";

/** Marks clipboard text as nodes copied from this editor. */
const CLIP = "edukors-editor/nodes";

interface Clip {
  nodes: CourseNode[];
  edges: CourseEdge[];
  /** the tab the nodes were copied in */
  from?: string;
  /** the languages of the course they came from, source first */
  langs?: string[];
}

/** The canvas is the only place nodes are cut, copied and pasted. */
export const onCanvas = () => {
  const s = useEditor.getState();
  return !!s.course && s.tab === "canvas";
};

/**
 * Whether what the person highlighted is text away from the canvas -- the
 * agent's answer, the problems panel, a label in the inspector -- in which
 * case copying is that text and not the nodes selected behind it. A selection
 * inside the canvas is left to the nodes: dragging one selects no text there.
 */
export function textSelected(selection: Selection | null): boolean {
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return false;
  const node = selection.anchorNode;
  const el = node && node.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null);
  return !!el && !el.closest(".canvas");
}

/** The selected nodes, and the edges between them, as clipboard text; null with nothing selected. */
export function selectionClip(): string | null {
  const store = useEditor.getState();
  if (!store.course || !store.selection.nodes.length) return null;
  const ids = new Set(store.selection.nodes);
  const nodes = store.course.nodes.filter((n) => ids.has(n.id));
  const edges = store.course.edges.filter((x) => ids.has(x.from) && ids.has(x.to));
  return JSON.stringify({ [CLIP]: true, from: store.docId, langs: courseLangs(store.course), nodes, edges }, null, 2);
}

export function deleteSelectedNodes(reason = "delete") {
  const store = useEditor.getState();
  const ids = store.selection.nodes;
  if (!ids.length) return;
  store.update((c) => deleteNodes(c, ids), reason);
  store.select({ nodes: [], edge: null });
}

/** Deletes the selected nodes, or else the selected edge. */
export function deleteSelection() {
  const store = useEditor.getState();
  if (store.selection.nodes.length) return deleteSelectedNodes();
  const index = store.selection.edge;
  if (index === null) return;
  store.update((c) => deleteEdges(c, [index]), "delete-edge");
  store.select({ edge: null });
}

const isNode = (v: unknown): v is CourseNode =>
  !!v && typeof v === "object" && typeof (v as CourseNode).id === "string" && NODE_TYPES.includes((v as CourseNode).type);

const nodeList = (v: unknown): CourseNode[] | null => (Array.isArray(v) && v.length > 0 && v.every(isNode) ? v : null);

/**
 * What pasted text holds: nodes copied in this editor, or JSON copied from a
 * course (in the JSON tab, say) -- a node, a list of nodes, or a whole course,
 * whose nodes and edges join this one. Null for anything else.
 */
export function readClip(text: string): Clip | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (isNode(data)) return { nodes: [data], edges: [] };
  const list = nodeList(data);
  if (list) return { nodes: list, edges: [] };
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const edges = Array.isArray(d.edges) ? (d.edges as CourseEdge[]) : [];
  if (d[CLIP])
    return {
      nodes: Array.isArray(d.nodes) ? d.nodes.filter(isNode) : [],
      edges,
      from: typeof d.from === "string" ? d.from : undefined,
      langs: Array.isArray(d.langs) ? d.langs.filter((l): l is string => typeof l === "string") : undefined,
    };
  const nodes = nodeList(d.nodes);
  if (!nodes) return null;
  return { nodes, edges, langs: courseLangs({ info: d.info } as Course) };
}

/** Adds the nodes in pasted text; false when the text holds none. */
export function pasteClip(text: string): boolean {
  const clip = readClip(text);
  const store = useEditor.getState();
  if (!clip?.nodes.length || !store.course) return false;
  const nodes = fitLanguages(clip.nodes, clip.langs ?? [], courseLangs(store.course));
  const positions = positionsOf(store.course);
  let map: Record<string, string> = {};
  store.update((c) => (map = pasteNodes(c, nodes, clip.edges)), "paste");
  const s = useEditor.getState();
  s.setPositions(placePasted(map, clip, positions, clip.from !== undefined && clip.from === s.docId));
  s.select({ nodes: Object.values(map), edge: null });
  return true;
}

const OFFSET = 60;
const NUDGE = 40;

/**
 * Where pasted nodes go. In the course they were copied from, beside their
 * originals, as always. From another course, or from JSON, around the middle
 * of the view, keeping how they sat. Never exactly on top of what is there.
 */
function placePasted(map: Record<string, string>, clip: Clip, positions: Record<string, Position>, same: boolean): Record<string, Position> {
  const olds = Object.keys(map);
  const types = new Map(clip.nodes.map((n) => [n.id, n.type]));
  const sat = new Map(clip.nodes.map((n) => [n.id, n.position]));
  const grid = (i: number): Position => ({ x: (i % 4) * 260, y: Math.floor(i / 4) * 160 });
  const base = new Map(olds.map((id, i) => [id, (same ? positions[id] : undefined) ?? sat.get(id) ?? (same ? { x: 0, y: 0 } : grid(i))]));
  let shift: Position = { x: OFFSET, y: OFFSET };
  if (!same) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [id, p] of base) {
      const size = sizeOf(types.get(id) ?? "");
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + size.width);
      y1 = Math.max(y1, p.y + size.height);
    }
    const center = canvasView.center?.() ?? { x: 80 + (x1 - x0) / 2, y: Math.max(0, ...Object.values(positions).map((p) => p.y)) + 200 + (y1 - y0) / 2 };
    shift = { x: center.x - (x0 + x1) / 2, y: center.y - (y0 + y1) / 2 };
  }
  const taken = new Set(Object.values(positions).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  const at = (p: Position) => ({ x: Math.round(p.x + shift.x), y: Math.round(p.y + shift.y) });
  for (let i = 0; i < 50 && [...base.values()].some((p) => taken.has(`${at(p).x},${at(p).y}`)); i++) shift = { x: shift.x + NUDGE, y: shift.y + NUDGE };
  return Object.fromEntries(olds.map((id) => [map[id], at(base.get(id)!)]));
}

export function selectAllNodes() {
  const store = useEditor.getState();
  if (store.course) store.select({ nodes: store.course.nodes.map((n) => n.id), edge: null });
}

// The toolbar's buttons, through the async clipboard API.

export async function copyNodes() {
  const text = selectionClip();
  if (text) await navigator.clipboard?.writeText(text);
}

export async function cutNodes() {
  const text = selectionClip();
  if (!text) return;
  await navigator.clipboard?.writeText(text);
  deleteSelectedNodes("cut");
}

export async function pasteNodesFromClipboard() {
  if (!onCanvas()) return;
  const text = await navigator.clipboard?.readText().catch(() => "");
  if (text) pasteClip(text);
}
