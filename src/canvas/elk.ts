/**
 * Automatic layout with ELK, for a course opened without a .layout.json or when
 * the author asks for it. Left to right, in the order the student goes, with
 * edges back into a cycle allowed to run against the flow.
 */
import type ELKType from "elkjs/lib/elk.bundled.js";
import type { Course } from "../schema/types";
import type { Position } from "../store/layout";
import { isJudge } from "../course/nodeTypes";

// ELK is large: loaded the first time a layout is asked for.
let elk: InstanceType<typeof ELKType> | null = null;

export const CARD = { width: 220, height: 92 };
export const DIAMOND = { width: 120, height: 120 };

export const sizeOf = (type: string) => (isJudge(type) ? DIAMOND : CARD);

const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": "90",
  "elk.spacing.nodeNode": "50",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.edgeRouting": "SPLINES",
};

/** Space between two sections side by side: their frames must not touch. */
const SECTION_GAP = 110;

/**
 * Positions for every node. A course with sections is laid out one section at
 * a time, each left to right, and the sections set side by side, left to
 * right in their order, so that every section's frame is a block of its own.
 */
export async function autoLayout(course: Course, measured: Record<string, { width: number; height: number }> = {}): Promise<Record<string, Position>> {
  const nodes = (course.nodes ?? []).filter((n) => n && typeof n.id === "string");
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (course.edges ?? []).filter((e) => ids.has(e?.from) && ids.has(e?.to) && e.from !== e.to);
  elk ??= new (await import("elkjs/lib/elk.bundled.js")).default();

  const groups = new Map<number, typeof nodes>();
  for (const n of nodes) {
    const k = Number(n.section ?? 1);
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }

  const positions: Record<string, Position> = {};
  let left = 0;
  for (const number of [...groups.keys()].sort((a, b) => a - b)) {
    const members = groups.get(number)!;
    const inside = new Set(members.map((n) => n.id));
    const result = await elk.layout({
      id: `section-${number}`,
      layoutOptions: OPTIONS,
      children: members.map((n) => ({ id: n.id, ...(measured[n.id] ?? sizeOf(n.type)) })),
      edges: edges.filter((e) => inside.has(e.from) && inside.has(e.to)).map((e, i) => ({ id: `e${number}-${i}`, sources: [e.from], targets: [e.to] })),
    });
    let right = 0;
    for (const child of result.children ?? []) {
      positions[child.id] = { x: Math.round(left + (child.x ?? 0)), y: Math.round(child.y ?? 0) };
      right = Math.max(right, (child.x ?? 0) + (child.width ?? 0));
    }
    left += right + SECTION_GAP;
  }
  return positions;
}
