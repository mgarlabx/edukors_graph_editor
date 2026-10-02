/**
 * The second file of a course: `<name>.layout.json`, beside `<name>.json`.
 *
 * Everything the editor knows about a course that is not the course: where the
 * nodes sit, how the view was left, and which writing tasks the author marked as
 * aligned. The course file stays exactly what the schema allows; this one is
 * the editor's alone.
 */

export interface Position {
  x: number;
  y: number;
}

export interface Layout {
  format: "edukors-editor-layout";
  version: 1;
  positions: Record<string, Position>;
  viewport?: { x: number; y: number; zoom: number };
  collapsedSections?: number[];
  /** "<judge>|<form>" -> hashes of the form's instructions and the judge's state when last marked as matching */
  pairs?: Record<string, { form: string; state: string }>;
}

export const emptyLayout = (): Layout => ({ format: "edukors-editor-layout", version: 1, positions: {} });

export const layoutPathFor = (coursePath: string): string => coursePath.replace(/(\.course)?\.json$/i, "") + ".layout.json";

export const parseLayout = (raw: string | null): Layout => {
  if (!raw) return emptyLayout();
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.positions && typeof data.positions === "object")
      return { ...emptyLayout(), ...data, format: "edukors-editor-layout", version: 1 };
  } catch {
    /* a broken layout is only a layout: start a new one */
  }
  return emptyLayout();
};

/** A short, stable fingerprint of a text (FNV-1a), to notice when a source changed. */
export const hashText = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
