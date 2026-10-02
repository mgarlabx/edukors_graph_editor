/**
 * Claude Code's /usage report, shown as it is written (in English). The lines
 * of the usage windows ("Current session: 22% used · resets …") go on top,
 * each with a bar when its percentage can be read; the rest of the report is
 * kept for the details. A report with no such lines is shown whole.
 */

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
