/**
 * Every storage key a course produces, with what it holds.
 *
 * The condition editor offers these keys, shows the scale of each, picks the
 * right input for its value and warns where an operator does not fit; the
 * prompt editors offer them for {{STORAGE: key}}. The list follows the schema's
 * descriptions of what each node type produces.
 */
import type { Course, CourseNode, Operator } from "../schema/types";
import { localize } from "./localize";

export type Scale =
  | "percent" // 0–100
  | "unit" // 0–1
  | "level" // 0 … n-1, not a whole number
  | "count" // a whole number of answers or points
  | "points"
  | "option" // one of a fixed list of names
  | "list" // the values picked in a check field
  | "bool"
  | "text";

export interface KeyInfo {
  key: string;
  node: string;
  scale: Scale;
  /** Set when the number comes from the AI, so `eq` on it is a mistake. */
  ai: boolean;
  /** option names for `option` and `list` */
  options?: string[];
  /** levels for `level` */
  levels?: number;
  max?: number;
  label: string;
}

const scored = (node: CourseNode) =>
  Array.isArray(node.content?.items) && node.content.items.some((i: { points?: unknown }) => Array.isArray(i?.points));

export function keysOfNode(node: CourseNode, lang: string): KeyInfo[] {
  const id = node.id;
  const c = node.content ?? {};
  const items: Record<string, unknown>[] = Array.isArray(c.items) ? c.items : [];
  const out: KeyInfo[] = [];
  const add = (name: string, scale: Scale, extra: Partial<KeyInfo> = {}) =>
    out.push({ key: `${id}.${name}`, node: id, scale, ai: false, label: name, ...extra });

  switch (node.type) {
    case "dynamic-md":
    case "dynamic-html":
      add("text", "text", { ai: true });
      break;
    case "quiz":
      add("score", "count", { max: items.length });
      add("total", "count", { max: items.length });
      add("percent", "percent", { max: 100 });
      for (const q of items)
        if (typeof q.key === "string")
          add(q.key, "option", {
            options: (Array.isArray(q.options) ? q.options : []).map((o: { value?: string }) => String(o?.value ?? "")),
            label: localize(q.question as never, lang) || q.key,
          });
      break;
    case "form":
      for (const f of items) {
        if (typeof f.key !== "string") continue;
        const options = (Array.isArray(f.options) ? f.options : []).map((o: { value?: string }) => String(o?.value ?? ""));
        const label = localize(f.label as never, lang) || f.key;
        if (f.type === "check") add(f.key, "list", { options, label });
        else if (f.type === "radio" || f.type === "select") add(f.key, "option", { options, label });
        else add(f.key, "text", { label });
      }
      break;
    case "bool":
      add("answer", "bool");
      break;
    case "choice":
      for (const q of items) {
        if (typeof q.key !== "string") continue;
        const criteria = q.criteria && typeof q.criteria === "object" ? Object.keys(q.criteria) : [];
        add(q.key, "option", { options: criteria, ai: true, label: String(q.instructions ?? q.key) });
        add(`${q.key}-confidence`, "unit", { ai: true });
      }
      break;
    case "score":
      for (const q of items) {
        if (typeof q.key !== "string") continue;
        const levels = Array.isArray(q.criteria) ? q.criteria.length : 0;
        add(q.key, "level", { levels, ai: true, label: String(q.instructions ?? q.key) });
        add(`${q.key}-confidence`, "unit", { ai: true });
        if (Array.isArray(q.points))
          add(`${q.key}-points`, "points", { ai: true, max: Math.max(0, ...q.points.filter((p) => typeof p === "number")) });
      }
      if (scored(node)) {
        add("total", "points", { ai: true });
        add("percent", "percent", { ai: true, max: 100 });
      }
      break;
    case "noul":
      for (const q of items) if (typeof q.key === "string") add(q.key, "unit", { ai: true, label: String(q.instructions ?? q.key) });
      break;
  }
  return out;
}

export const keysOfCourse = (course: Course, lang: string): KeyInfo[] =>
  (Array.isArray(course?.nodes) ? course.nodes : []).flatMap((n) => (n && typeof n === "object" ? keysOfNode(n, lang) : []));

export const scaleLabel = (k: KeyInfo): string => {
  switch (k.scale) {
    case "percent":
      return "0–100";
    case "unit":
      return "0–1";
    case "level":
      return `0–${Math.max(0, (k.levels ?? 1) - 1)}`;
    case "count":
      return k.max !== undefined ? `0–${k.max}` : "#";
    case "points":
      return k.max !== undefined ? `0–${k.max}` : "pts";
    case "option":
      return (k.options ?? []).join(" | ");
    case "list":
      return `[${(k.options ?? []).join(", ")}]`;
    case "bool":
      return "true | false";
    case "text":
      return "text";
  }
};

export const isNumeric = (s: Scale) => ["percent", "unit", "level", "count", "points"].includes(s);

export const operatorsFor = (s: Scale): Operator[] => {
  if (isNumeric(s)) return ["gte", "gt", "lte", "lt", "eq", "ne"];
  if (s === "list") return ["contains", "not-contains"];
  if (s === "bool") return ["eq", "ne"];
  if (s === "option") return ["eq", "ne"];
  return ["contains", "not-contains", "eq", "ne"];
};

export const OPPOSITE: Record<Operator, Operator> = {
  eq: "ne",
  ne: "eq",
  gt: "lte",
  gte: "lt",
  lt: "gte",
  lte: "gt",
  contains: "not-contains",
  "not-contains": "contains",
};

export const OPERATOR_SYMBOL: Record<Operator, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "∋",
  "not-contains": "∌",
};
