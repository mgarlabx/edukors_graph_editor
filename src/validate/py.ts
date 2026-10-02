/**
 * The bits of Python the validator's messages are written in.
 *
 * validate_course.py prints values with !r and names types with __name__, and
 * the editor has to print the same lines -- the parity test compares them one
 * for one -- so the port formats values the way Python would.
 */

const printable = (ch: string) => {
  const code = ch.codePointAt(0)!;
  return code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code < 0xa0);
};

const reprString = (s: string): string => {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    if (ch === quote || ch === "\\") out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (!printable(ch)) out += "\\x" + ch.codePointAt(0)!.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + quote;
};

const reprNumber = (n: number): string => {
  if (Number.isNaN(n)) return "nan";
  if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf";
  return String(n);
};

export const repr = (value: unknown): string => {
  if (value === undefined || value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return reprNumber(value);
  if (typeof value === "string") return reprString(value);
  if (Array.isArray(value)) return "[" + value.map(repr).join(", ") + "]";
  if (typeof value === "object")
    return (
      "{" +
      Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${reprString(k)}: ${repr(v)}`)
        .join(", ") +
      "}"
    );
  return String(value);
};

/** str() of a value, as an f-string without !r prints it. */
export const str = (value: unknown): string => {
  if (typeof value === "string") return value;
  return repr(value);
};

export const typeName = (value: unknown): string => {
  if (value === undefined || value === null) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  return "dict";
};

export const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** isinstance(v, int): a JSON number with no fraction, and in Python a bool too. */
export const isInt = (v: unknown): boolean =>
  typeof v === "boolean" || (typeof v === "number" && Number.isInteger(v));

/** isinstance(v, int) and not isinstance(v, bool). */
export const wholeNumber = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** str.split() with no argument: runs of whitespace, no empty pieces. */
export const words = (text: string): string[] => text.split(/\s+/u).filter(Boolean);

/** str.strip() is falsy. */
export const blank = (text: string): boolean => text.trim() === "";

export const sorted = <T>(items: Iterable<T>): T[] =>
  [...items].sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
