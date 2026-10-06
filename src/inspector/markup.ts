/**
 * The content editor's toolbar, as text edits: each command takes the text and
 * its selection and says what to put in place of a part of it and what to
 * select afterwards, in Markdown or in HTML. The editor applies the edit
 * through the text box's own history, so ⌘Z undoes it like typing.
 */
export type Markup = "markdown" | "html";
export type MarkupCommand = "heading" | "paragraph" | "bold" | "italic" | "ul" | "ol" | "link" | "image";

/** Replace `value.slice(from, to)` with `text`, then select `select` in the new value. */
export interface TextEdit {
  from: number;
  to: number;
  text: string;
  select: [number, number];
}

/** The commands each kind of text gets, in the toolbar's order. */
export const COMMANDS: Record<Markup, MarkupCommand[]> = {
  markdown: ["heading", "bold", "italic", "ul", "ol", "link", "image"],
  html: ["heading", "paragraph", "bold", "italic", "ul", "ol", "link", "image"],
};

const TAGS: Partial<Record<MarkupCommand, string>> = { heading: "h2", paragraph: "p", bold: "strong", italic: "em" };

export function applyMarkup(kind: Markup, command: MarkupCommand, value: string, start: number, end: number): TextEdit {
  if (kind === "markdown")
    switch (command) {
      case "heading":
        return toggleLines(value, start, end, HEADING, (l) => `## ${l.replace(HEADING, "$1")}`);
      case "bold":
        return wrap(value, start, end, "**", "**");
      case "italic":
        // _ and not *: a toggle that looks for * would take one star of a bold.
        return wrap(value, start, end, "_", "_");
      case "ul":
        return toggleLines(value, start, end, BULLET, (l) => l.replace(NUMBER, "$1").replace(/^(\s*)/, "$1- "));
      case "ol": {
        let n = 0;
        return toggleLines(value, start, end, NUMBER, (l) => l.replace(BULLET, "$1").replace(/^(\s*)/, `$1${++n}. `));
      }
      case "link":
        return reference(value, start, end, "[", "](", ")");
      case "image":
        return reference(value, start, end, "![", "](", ")", true);
      default:
        return { from: start, to: end, text: value.slice(start, end), select: [start, end] };
    }
  switch (command) {
    case "ul":
    case "ol":
      return list(value, start, end, command);
    case "link": {
      [start, end] = trimmed(value, start, end);
      const text = value.slice(start, end);
      const open = '<a href="';
      const out = `${open}url">${text}</a>`;
      // With a text, the address is what is left to write; without one, the text.
      const at = text ? start + open.length : start + open.length + 5;
      return { from: start, to: end, text: out, select: text ? [at, at + 3] : [at, at] };
    }
    case "image": {
      [start, end] = trimmed(value, start, end);
      const open = '<img src="';
      return { from: start, to: end, text: `${open}url" alt="${value.slice(start, end)}">`, select: [start + open.length, start + open.length + 3] };
    }
    default: {
      const tag = TAGS[command] ?? "span";
      return wrap(value, start, end, `<${tag}>`, `</${tag}>`);
    }
  }
}

const HEADING = /^(\s*)#{1,6}\s+/;
const BULLET = /^(\s*)[-*+]\s+/;
const NUMBER = /^(\s*)\d+[.)]\s+/;

/**
 * A mark at the start of each line the selection touches (a heading, an item
 * of a list): taken away when every written line has it, else put on each
 * written line. A single line gets it even when empty, to start writing.
 */
function toggleLines(value: string, start: number, end: number, mark: RegExp, add: (line: string) => string): TextEdit {
  return eachLine(value, start, end, (lines) => {
    const written = lines.filter((l) => l.trim());
    if (written.length && written.every((l) => mark.test(l))) return lines.map((l) => l.replace(mark, "$1"));
    return lines.map((l) => (l.trim() || lines.length === 1 ? add(l) : l));
  });
}

/** The selection without the blanks at its ends: a double click on Windows takes the space after the word. */
const trimmed = (value: string, start: number, end: number): [number, number] => {
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;
  return [start, end];
};

/** Puts the selection between `open` and `close`, or takes them away when they are already around it or at its ends. */
function wrap(value: string, start: number, end: number, open: string, close: string): TextEdit {
  [start, end] = trimmed(value, start, end);
  const text = value.slice(start, end);
  if (start >= open.length && value.slice(start - open.length, start) === open && value.slice(end, end + close.length) === close)
    return { from: start - open.length, to: end + close.length, text, select: [start - open.length, end - open.length] };
  if (text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
    const inner = text.slice(open.length, text.length - close.length);
    return { from: start, to: end, text: inner, select: [start, start + inner.length] };
  }
  return { from: start, to: end, text: open + text + close, select: [start + open.length, start + open.length + text.length] };
}

/** `[text](url)`, `![alt](url)`: with a text, "url" is selected to be written over; without one, the caret goes where the text goes. */
function reference(value: string, start: number, end: number, open: string, middle: string, close: string, alt = false): TextEdit {
  [start, end] = trimmed(value, start, end);
  const text = value.slice(start, end);
  const out = `${open}${text}${middle}url${close}`;
  const url = start + open.length + text.length + middle.length;
  return { from: start, to: end, text: out, select: text || alt ? [url, url + 3] : [start + open.length, start + open.length] };
}

/** The whole lines the selection touches; a selection that ends right after a line break leaves the next line out. */
function lineRange(value: string, start: number, end: number): [number, number] {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const to = value.indexOf("\n", last);
  return [from, to < 0 ? value.length : to];
}

/** Rewrites the lines the selection touches; a caret ends up at the end of its line, a selection takes the lines rewritten. */
function eachLine(value: string, start: number, end: number, rewrite: (lines: string[]) => string[]): TextEdit {
  const [from, to] = lineRange(value, start, end);
  const text = rewrite(value.slice(from, to).split("\n")).join("\n");
  return { from, to, text, select: start === end ? [from + text.length, from + text.length] : [from, from + text.length] };
}

/** `<ul>` or `<ol>` with one `<li>` per line selected; with nothing selected, an empty item to write in. */
function list(value: string, start: number, end: number, tag: "ul" | "ol"): TextEdit {
  if (start === end) {
    const before = `<${tag}>\n  <li>`;
    return { from: start, to: end, text: `${before}</li>\n</${tag}>`, select: [start + before.length, start + before.length] };
  }
  const [from, to] = lineRange(value, start, end);
  const items = value
    .slice(from, to)
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `  <li>${l.trim()}</li>`);
  const text = `<${tag}>\n${items.join("\n")}\n</${tag}>`;
  return { from, to, text, select: [from, from + text.length] };
}

/** A {{STORAGE: key}} being typed, as the text before the caret ends: where it starts and what of the key is written. */
export interface StorageQuery {
  start: number;
  text: string;
}

/** The {{STORAGE: …}} being typed before the caret, from "{{" on; null when the caret is not in one. */
export function storageQuery(before: string): StorageQuery | null {
  const m = /\{\{\s*(?:S(?:T(?:O(?:R(?:A(?:G(?:E(?::\s*)?)?)?)?)?)?)?)?([a-z0-9.-]*)$/i.exec(before);
  return m ? { start: before.length - m[0].length, text: m[1] ?? "" } : null;
}

/** What a key picked from the list writes. */
export const storageRef = (key: string) => `{{STORAGE: ${key}}}`;
