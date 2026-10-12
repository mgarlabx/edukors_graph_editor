/**
 * The files the person attaches to a message. The composer shows them as cards
 * and the message carries their paths at its end, in a block of their own, so
 * that the agent knows to read them and the conversation, read back from disk,
 * shows them as cards again.
 */

const OPEN = "<attached-files>";
const CLOSE = "</attached-files>";
const FILES_RE = /\s*<attached-files>\n([\s\S]*?)\n<\/attached-files>\s*$/;

/** The last part of a path, on any system. */
export const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/**
 * A file's name in the room of a card: the start of it, an ellipsis and the
 * extension, which says what kind of file it is ("relatorio-do-semes….pdf").
 */
export function shortName(name: string, max = 24): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : "";
  return `${name.slice(0, Math.max(1, max - ext.length - 1)).trimEnd()}…${ext}`;
}

/** The message with the files' paths at its end. */
export const withFiles = (body: string, files: string[]) => (files.length ? `${body}${body ? "\n\n" : ""}${OPEN}\n${files.join("\n")}\n${CLOSE}` : body);

/** A message as the person wrote it, and the files that went with it. */
export function splitFiles(text: string): { text: string; files?: string[] } {
  const m = FILES_RE.exec(text);
  if (!m) return { text };
  const files = m[1].split("\n").map((l) => l.trim()).filter(Boolean);
  return { text: text.slice(0, m.index), ...(files.length ? { files } : {}) };
}
