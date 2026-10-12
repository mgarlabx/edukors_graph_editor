/**
 * A part's `extras` as text, for the extras editor: what is typed, read back.
 * The format allows no empty extras, so an empty text, or {}, is "no extras".
 */
import type { Extras } from "../schema/types";
import { syntaxErrorAt } from "./serialize";
import { t } from "../i18n";

export type ParsedExtras = { ok: true; value: Extras | undefined } | { ok: false; error: string };

export const parseExtras = (text: string): ParsedExtras => {
  if (!text.trim()) return { ok: true, value: undefined };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    const at = syntaxErrorAt(text);
    return { ok: false, error: at ? t("json.at", at) : t("extras.invalid") };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: t("extras.notObject") };
  return { ok: true, value: Object.keys(value).length ? (value as Extras) : undefined };
};
