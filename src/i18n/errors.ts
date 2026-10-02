/**
 * Errors in the interface's language.
 *
 * The editor's own errors carry a key of the locales (Said, and NotJudged,
 * which is one) and keep an English message for the logs and the parity tests.
 * The rest arrive as text in English -- from the Rust side, or the browser's
 * stand-ins for it -- and the ones the editor knows are matched here and said
 * again; anything else is shown as it came.
 */
import { t, type Params } from ".";

/** An error the interface can show in its own language; its message stays in English. */
export class Said extends Error {
  constructor(
    message: string,
    readonly key: string,
    readonly params: Params = {},
  ) {
    super(message);
  }
}

/** errno -> the key that says it, for what Rust's io::Error prints as "... (os error N)". */
const OS_ERRORS: Record<number, string> = {
  1: "err.denied",
  2: "err.notFound",
  13: "err.denied",
  20: "err.notFound",
  21: "err.isDir",
  28: "err.diskFull",
  30: "err.readOnly",
  63: "err.nameTooLong",
};

/** What src-tauri/src/lib.rs (and app/platform.ts in a browser) answer with. */
const KNOWN: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(.+): stream did not contain valid UTF-8$/, (m) => t("err.notText", { path: m[1] })],
  [/^(.+): ([^:]*) \(os error (\d+)\)$/, (m) => t(OS_ERRORS[Number(m[3])] ?? "err.io", { path: m[1], detail: m[2] })],
  [/^no OpenRouter key/, () => t("err.noKey")],
  [/^refused: (.+) is not an OpenRouter address$/, (m) => t("err.notOpenRouter", { url: m[1] })],
  [/^unreadable answer$/, () => t("err.unreadable")],
  [/^request failed \((\d+)\)$/, (m) => t("err.http", { status: m[1] })],
  [/^empty key$/, () => t("err.emptyKey")],
];

const known = (text: string): string => {
  for (const [re, say] of KNOWN) {
    const m = re.exec(text);
    if (m) return say(m);
  }
  return text;
};

/** Anything thrown or answered as an error, as a sentence in the interface's language. */
export const errorText = (e: unknown): string => {
  if (e instanceof Said)
    return t(e.key, Object.fromEntries(Object.entries(e.params).map(([k, v]) => [k, k === "error" ? known(String(v)) : v])));
  return known(e instanceof Error ? e.message : String(e));
};
