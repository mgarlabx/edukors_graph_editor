/**
 * Writing a course back the way it was read.
 *
 * Opening and saving a course must not change a byte of it, so the file's own
 * style -- its indentation, its last newline, whether it escapes non-ASCII -- is
 * read on the way in and used on the way out. A new course gets the builder's
 * style: two spaces, UTF-8, a final newline.
 */

export interface JsonStyle {
  indent: string;
  trailingNewline: boolean;
  ascii: boolean;
}

export const DEFAULT_STYLE: JsonStyle = { indent: "  ", trailingNewline: true, ascii: false };

export const detectStyle = (raw: string): JsonStyle => {
  const indent = /^\{\r?\n([ \t]+)"/.exec(raw)?.[1] ?? "  ";
  const trailingNewline = /\n$/.test(raw);
  // eslint-disable-next-line no-control-regex
  const hasRawNonAscii = /[^\x00-\x7f]/.test(raw);
  const hasEscapes = /\\u00[89a-f][0-9a-f]|\\u0[1-9a-f][0-9a-f]{2}|\\u[1-9a-f][0-9a-f]{3}/i.test(raw);
  return { indent, trailingNewline, ascii: hasEscapes && !hasRawNonAscii };
};

export const stringify = (value: unknown, style: JsonStyle = DEFAULT_STYLE): string => {
  let text = JSON.stringify(value, null, style.indent);
  if (style.ascii)
    text = text.replace(/[\u007f-￿]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
  return style.trailingNewline ? text + "\n" : text;
};

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

/**
 * Where JSON.parse gives up on a text, as line and column from 1, or null when
 * it parses. WebKit's own message says what went wrong, in English, but not where.
 */
export const syntaxErrorAt = (text: string): { line: number; column: number } | null => {
  let i = 0;
  const fail = (): never => {
    throw i;
  };
  const space = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const string = () => {
    i++;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') return void i++;
      if (ch < " ") fail();
      if (ch === "\\") {
        i++;
        if (text[i] === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) i += 4;
        else if (!'"\\/bfnrt'.includes(text[i] ?? "x")) fail();
      }
      i++;
    }
    fail();
  };
  const value = (): void => {
    space();
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      const close = ch === "{" ? "}" : "]";
      i++;
      space();
      if (text[i] === close) return void i++;
      for (;;) {
        if (close === "}") {
          space();
          if (text[i] !== '"') fail();
          string();
          space();
          if (text[i] !== ":") fail();
          i++;
        }
        value();
        space();
        if (text[i] === close) return void i++;
        if (text[i] !== ",") fail();
        i++;
      }
    }
    if (ch === '"') return string();
    for (const word of ["true", "false", "null"]) if (text.startsWith(word, i)) return void (i += word.length);
    NUMBER.lastIndex = i;
    const n = NUMBER.exec(text);
    if (!n) fail();
    i += n![0].length;
  };
  try {
    value();
    space();
    if (i < text.length) fail();
    return null;
  } catch (at) {
    if (typeof at !== "number") throw at;
    const before = text.slice(0, at);
    return { line: before.split("\n").length, column: at - before.lastIndexOf("\n") };
  }
};
