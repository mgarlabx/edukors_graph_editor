/**
 * Conditions: how the player reads them, and how the canvas labels them.
 *
 * holds() is the player's Course.holds, operator for operator, including its
 * loose equality: a bool compares as a bool, two numeric-looking values as
 * numbers, anything else as text. The preview highlights the edge the player
 * took using this very function, so the two cannot disagree.
 */
import type { Condition, CourseEdge, Operator } from "../schema/types";
import { OPERATOR_SYMBOL } from "./keys";

type Vars = Record<string, unknown>;

const numeric = (v: unknown) => v !== "" && v !== null && !Array.isArray(v) && !Number.isNaN(Number(v));

const same = (a: unknown, b: unknown) =>
  typeof a === "boolean" || typeof b === "boolean"
    ? Boolean(a) === Boolean(b)
    : numeric(a) && numeric(b)
      ? Number(a) === Number(b)
      : String(a) === String(b);

const contains = (a: unknown, b: unknown) =>
  Array.isArray(a) ? a.some((x) => same(x, b)) : String(a).toLowerCase().includes(String(b).toLowerCase());

const OPS: Record<string, (a: unknown, b: unknown) => boolean> = {
  eq: same,
  ne: (a, b) => !same(a, b),
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  contains,
  "not-contains": (a, b) => !contains(a, b),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const holds = (when: any, vars: Vars): boolean => {
  if (!when) return true;
  if (Array.isArray(when.and)) return when.and.every((c: unknown) => holds(c, vars));
  if (Array.isArray(when.or)) return when.or.some((c: unknown) => holds(c, vars));
  const op = OPS[when.operator];
  if (!op) return false;
  const left = vars?.[when.key];
  return left !== null && left !== undefined && op(left, when.value);
};

/** The edge the player takes out of a node: the first whose condition holds. */
export const chooseEdge = (edges: CourseEdge[], from: string, vars: Vars): number =>
  edges.findIndex((e) => e.from === from && holds(e.when, vars));

const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** A short label: `q1.percent ≥ 70`, `(a ∧ b)`. */
export const summarize = (when: Condition | undefined, depth = 0): string => {
  if (!when) return "";
  if ("and" in when && Array.isArray(when.and)) {
    const inner = when.and.map((c) => summarize(c, depth + 1)).join(" ∧ ");
    return depth ? `(${inner})` : inner;
  }
  if ("or" in when && Array.isArray(when.or)) {
    const inner = when.or.map((c) => summarize(c, depth + 1)).join(" ∨ ");
    return depth ? `(${inner})` : inner;
  }
  const c = when as { key: string; operator: Operator; value: unknown };
  return `${c.key} ${OPERATOR_SYMBOL[c.operator] ?? c.operator} ${fmt(c.value)}`;
};

/** Every comparison of a condition tree, depth first. */
export const comparisons = (when: Condition | undefined): { key: string; operator: Operator; value: unknown }[] => {
  if (!when) return [];
  if ("and" in when && Array.isArray(when.and)) return when.and.flatMap(comparisons);
  if ("or" in when && Array.isArray(when.or)) return when.or.flatMap(comparisons);
  return [when as { key: string; operator: Operator; value: unknown }];
};
