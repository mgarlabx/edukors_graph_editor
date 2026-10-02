import type { Loc } from "../schema/types";

/**
 * The text of a localized list in one language, as the player and the PHP
 * Course::localize() pick it: the exact language, then the same base language,
 * then the first entry.
 */
export const localize = (list: Loc | string | undefined | null, lang: string): string => {
  if (typeof list === "string") return list;
  if (!Array.isArray(list) || list.length === 0) return "";
  const exact = list.find((e) => e?.lang === lang);
  if (exact) return String(exact.text ?? "");
  const base = lang.split("-")[0];
  const near = list.find((e) => String(e?.lang ?? "").split("-")[0] === base);
  if (near) return String(near.text ?? "");
  return String(list[0]?.text ?? "");
};

/** The entry in exactly this language, or undefined. */
export const entryOf = (list: Loc | undefined, lang: string) =>
  Array.isArray(list) ? list.find((e) => e?.lang === lang) : undefined;

/** A copy of the list with the text of one language set (added when missing). */
export const withText = (list: Loc | undefined, lang: string, text: string, order?: string[]): Loc => {
  const current = Array.isArray(list) ? list : [];
  const found = current.some((e) => e.lang === lang);
  const next = found
    ? current.map((e) => (e.lang === lang ? { ...e, text } : e))
    : [...current, { lang, text }];
  if (!order || found) return next;
  return [...next].sort((a, b) => rank(order, a.lang) - rank(order, b.lang));
};

const rank = (order: string[], lang: string) => {
  const i = order.indexOf(lang);
  return i === -1 ? order.length : i;
};

export const STORAGE_RE = /\{\{\s*STORAGE:\s*([^}]+?)\s*\}\}/g;

/** Every key read by {{STORAGE: key}} in a text. */
export const storageKeys = (text: string): string[] =>
  [...String(text ?? "").matchAll(STORAGE_RE)].map((m) => m[1].trim());
