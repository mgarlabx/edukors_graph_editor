/**
 * Inserting a node of one of the ten types, from the Insert menu or the
 * toolbar's + list (plan 5.1). The native menu lists the same groups, in the
 * same order (src-tauri/src/lib.rs).
 */
import { courseLangs, useEditor } from "../store/editor";
import { flushPending } from "../store/docs";
import { positionsOf } from "../store/layout";
import { NODE_TYPES } from "../course/nodeTypes";
import { addNode } from "../course/ops";
import type { NodeType } from "../schema/types";

export const INSERT_GROUPS: { label: string; types: NodeType[] }[] = [
  { label: "insert.content", types: NODE_TYPES.slice(0, 4) },
  { label: "insert.activities", types: NODE_TYPES.slice(4, 7) },
  { label: "insert.judges", types: NODE_TYPES.slice(7) },
];

/** Drag data for a type, dropped where the node goes (canvas/Canvas.tsx). */
export const NODE_DRAG = "application/edukors-node";

/** From a node to the next one down: a card and the space between two layers. */
const STEP = 200;

/**
 * A new node below the selected one (or the whole graph),
 * selected and framed on the map, whichever view is on screen.
 */
export function insertNode(type: NodeType) {
  // What is being typed in the JSON tab gets into the course first, or it would replace the node on the way out.
  flushPending();
  const store = useEditor.getState();
  if (!store.course) return;
  const positions = positionsOf(store.course);
  const anchor = store.selection.nodes[0] ? positions[store.selection.nodes[0]] : undefined;
  const fallback = { x: 80, y: Math.max(0, ...Object.values(positions).map((p) => p.y)) + STEP };
  let id = "";
  store.update((c) => (id = addNode(c, type, courseLangs(c))), "add");
  store.setPositions({ [id]: anchor ? { x: anchor.x, y: anchor.y + STEP } : fallback });
  store.reveal({ node: id });
}
