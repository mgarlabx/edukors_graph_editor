/**
 * Where the nodes sit, and what else the editor knows about a course that is
 * not the course.
 *
 * The positions are part of the course: each node carries its own `position`,
 * which the schema allows and players ignore, so a course is a single file.
 * The rest -- how the view was left, which writing tasks the author marked as
 * aligned -- belongs to the course's tab while it is open and is not saved.
 */
import type { Course, CourseNode } from "../schema/types";

export interface Position {
  x: number;
  y: number;
}

export interface Layout {
  viewport?: { x: number; y: number; zoom: number };
  /** "<judge>|<form>" -> hashes of the form's instructions and the judge's state when last marked as matching */
  pairs?: Record<string, { form: string; state: string }>;
}

export const emptyLayout = (): Layout => ({});

const NONE: Record<string, Position> = {};
const known = new WeakMap<Course, Record<string, Position>>();

/** The position of each node that has one, by id: the same object for the same course, so that it can be selected from the store. */
export function positionsOf(course: Course | null): Record<string, Position> {
  if (!course) return NONE;
  let positions = known.get(course);
  if (!positions) {
    positions = {};
    for (const n of Array.isArray(course.nodes) ? course.nodes : []) {
      const p = n?.position;
      if (typeof n?.id === "string" && p && typeof p.x === "number" && typeof p.y === "number") positions[n.id] = { x: p.x, y: p.y };
    }
    known.set(course, positions);
  }
  return positions;
}

/** A node at a new place. A node placed for the first time gets `position` where the schema lists it: before the title. */
function placed(node: CourseNode, at: Position): CourseNode {
  if ("position" in node) return { ...node, position: at };
  const entries = Object.entries(node);
  const title = entries.findIndex(([k]) => k === "title");
  entries.splice(title === -1 ? entries.length : title, 0, ["position", at]);
  return Object.fromEntries(entries) as CourseNode;
}

/**
 * The course with these nodes moved, rounded to whole units. Only the nodes
 * that move are copied, and a course where nothing moves is returned as it
 * was, so that it does not look changed.
 */
export function placeNodes(course: Course, moves: Record<string, Position>): Course {
  let changed = false;
  const nodes = course.nodes.map((n) => {
    const to = n && moves[n.id];
    if (!to) return n;
    const at = { x: Math.round(to.x), y: Math.round(to.y) };
    if (n.position?.x === at.x && n.position?.y === at.y) return n;
    changed = true;
    return placed(n, at);
  });
  return changed ? { ...course, nodes } : course;
}

/** A short, stable fingerprint of a text (FNV-1a), to notice when a source changed. */
export const hashText = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
