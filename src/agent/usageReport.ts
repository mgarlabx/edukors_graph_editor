/**
 * Claude Code's /usage report, shown as it is written (in English). The lines
 * of the usage windows ("Current session: 22% used · resets …") go on top,
 * each with a bar when its percentage can be read; the rest of the report is
 * kept for the details. A report with no such lines is shown whole.
 */

import type { UsageLimit } from "./events";

export interface UsageWindow {
  line: string;
  /** the share of the window used, 0–100, when the line says it */
  percent?: number;
}

export function splitUsage(text: string): { windows: UsageWindow[]; rest: string } {
  const lines = text.split("\n");
  const windows: UsageWindow[] = [];
  const rest: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^Current\b/.test(line)) {
      const m = /(\d+(?:\.\d+)?)\s*%\s*used/i.exec(line);
      windows.push(m ? { line, percent: Math.min(100, Number(m[1])) } : { line });
    } else rest.push(raw);
  }
  if (!windows.length) return { windows, rest: text.trim() };
  return { windows, rest: rest.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

/** The shorter window first: the five hours, then the week, then anything else. */
const WINDOW_ORDER = ["5h", "daily", "weekly"];
const rank = (w: string) => (WINDOW_ORDER.includes(w) ? WINDOW_ORDER.indexOf(w) : WINDOW_ORDER.length);

/**
 * The limits Codex and Antigravity report, by the group of models that shares
 * them, in the order they came, each group's shorter window first.
 */
export function groupLimits(limits: UsageLimit[]): { group?: string; limits: UsageLimit[] }[] {
  const groups: { group?: string; limits: UsageLimit[] }[] = [];
  for (const limit of limits) {
    let here = groups.find((g) => g.group === limit.group);
    if (!here) groups.push((here = { group: limit.group, limits: [] }));
    here.limits.push(limit);
  }
  for (const g of groups) g.limits.sort((a, b) => rank(a.window) - rank(b.window));
  return groups;
}
