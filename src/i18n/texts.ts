/**
 * Every localized text of a course, addressed by a stable path.
 *
 * A path names nodes by id, not by position, so it survives reordering:
 * `node:q1/content/items/0/question`, `info/title`, `info/sections/2/title`.
 * The translator, the language panel and the "outdated translation" marks
 * all walk the course through this list.
 */
import type { Course, Loc } from "../schema/types";

export type TextKind = "plain" | "markdown" | "inline" | "html" | "prompt";

export interface TextField {
  path: string;
  node?: string;
  /** what the field is, for labels: "title", "question", "option label"… */
  label: string;
  kind: TextKind;
  /** prompts are instructions for the AI: never translated, never required per language */
  translatable: boolean;
  list: Loc;
}

const isLoc = (v: unknown): v is Loc => Array.isArray(v);

export function textFields(course: Course): TextField[] {
  const out: TextField[] = [];
  const push = (path: string, label: string, kind: TextKind, list: unknown, node?: string, translatable = true) => {
    if (isLoc(list)) out.push({ path, label, kind, list, node, translatable });
  };
  const info = course?.info;
  if (info) {
    push("info/title", "course title", "plain", info.title);
    push("info/description", "course description", "plain", info.description);
    (Array.isArray(info.sections) ? info.sections : []).forEach((s, i) => push(`info/sections/${i}/title`, "section title", "plain", s?.title));
  }
  for (const n of Array.isArray(course?.nodes) ? course.nodes : []) {
    if (!n || typeof n.id !== "string") continue;
    const base = `node:${n.id}`;
    const c = n.content ?? {};
    push(`${base}/title`, "title", "plain", n.title, n.id);
    switch (n.type) {
      case "static-md":
        push(`${base}/content/item`, "content", "markdown", c.item, n.id);
        break;
      case "static-html":
        push(`${base}/content/item`, "content", "html", c.item, n.id);
        break;
      case "dynamic-md":
      case "dynamic-html":
        push(`${base}/content/prompt`, "prompt", "prompt", c.prompt, n.id, false);
        break;
      case "quiz":
        (Array.isArray(c.items) ? c.items : []).forEach((q: Record<string, unknown>, i: number) => {
          push(`${base}/content/items/${i}/question`, "question", "markdown", q?.question, n.id);
          (Array.isArray(q?.options) ? q.options : []).forEach((o: Record<string, unknown>, j: number) =>
            push(`${base}/content/items/${i}/options/${j}/label`, "option label", "inline", o?.label, n.id),
          );
          push(`${base}/content/items/${i}/feedback`, "feedback", "markdown", q?.feedback, n.id);
        });
        break;
      case "form":
        push(`${base}/content/instructions`, "instructions", "markdown", c.instructions, n.id);
        (Array.isArray(c.items) ? c.items : []).forEach((f: Record<string, unknown>, i: number) => {
          push(`${base}/content/items/${i}/label`, "field label", "inline", f?.label, n.id);
          (Array.isArray(f?.options) ? f.options : []).forEach((o: Record<string, unknown>, j: number) =>
            push(`${base}/content/items/${i}/options/${j}/label`, "option label", "inline", o?.label, n.id),
          );
        });
        break;
      case "bool":
        push(`${base}/content/question`, "question", "markdown", c.question, n.id);
        push(`${base}/content/yes-label`, "yes-label", "plain", c["yes-label"], n.id);
        push(`${base}/content/no-label`, "no-label", "plain", c["no-label"], n.id);
        break;
    }
  }
  return out;
}

const segments = (path: string) => path.split("/");

/** The object holding a path's last segment, in a course (or draft). */
const parentOf = (course: Course, path: string): [Record<string, unknown> | undefined, string] => {
  const parts = segments(path);
  let cur: unknown;
  const first = parts.shift()!;
  if (first.startsWith("node:")) cur = course.nodes.find((n) => n.id === first.slice(5));
  else cur = (course as unknown as Record<string, unknown>)[first];
  const last = parts.pop()!;
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return [cur as Record<string, unknown> | undefined, last];
};

export const getText = (course: Course, path: string): Loc | undefined => {
  const [parent, last] = parentOf(course, path);
  const v = parent?.[last];
  return isLoc(v) ? v : undefined;
};

export const setText = (course: Course, path: string, list: Loc) => {
  const [parent, last] = parentOf(course, path);
  if (parent) parent[last] = list;
};

/** Empty or missing per language, translatable fields only. */
export function coverage(course: Course, langs: string[]) {
  const fields = textFields(course).filter((f) => f.translatable);
  return langs.map((lang) => {
    const missing = fields.filter((f) => {
      const e = f.list.find((x) => x?.lang === lang);
      return !e || typeof e.text !== "string" || e.text.trim() === "";
    });
    return { lang, total: fields.length, missing };
  });
}
