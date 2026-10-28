/**
 * The files the person attaches to a message. The composer shows them as
 * cards; the message carries them at its end, in a block of their own, with
 * each file's contents: the agent has no file tools, so the editor reads them
 * (text files, up to a size) and sends what it read.
 */
import { native } from "../app/platform";

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

/** Past this size a file is not sent: the agent reads the note instead. */
const MAX_TEXT = 300_000;

/** A file's contents for the agent, or a note saying why it is not there. */
async function contentsOf(path: string): Promise<string> {
  try {
    const text = await native.readText(path);
    if (text.includes("\u0000")) return "(not a text file: its contents were not sent)";
    if (text.length > MAX_TEXT) return `(too large to send: ${Math.round(text.length / 1000)} kB)`;
    return text;
  } catch (e) {
    return `(could not be read: ${e instanceof Error ? e.message : String(e)})`;
  }
}

/** The message with the files at its end: each one's name, path and contents. */
export async function withFiles(body: string, files: string[]): Promise<string> {
  if (!files.length) return body;
  const parts = await Promise.all(files.map(async (path) => `<file name="${fileName(path).replace(/"/g, "'")}" path="${path.replace(/"/g, "'")}">\n${await contentsOf(path)}\n</file>`));
  return `${body}${body ? "\n\n" : ""}${OPEN}\n${parts.join("\n")}\n${CLOSE}`;
}

/** A message as the person wrote it, and the files that went with it. */
export function splitFiles(text: string): { text: string; files?: string[] } {
  const m = FILES_RE.exec(text);
  if (!m) return { text };
  const files = m[1].split("\n").map((l) => l.trim()).filter(Boolean);
  return { text: text.slice(0, m.index), ...(files.length ? { files } : {}) };
}
