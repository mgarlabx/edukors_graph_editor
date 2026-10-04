/**
 * The editor's own words, in Portuguese, English and Spanish.
 *
 * The strings live in locales/*.json, apart from the code, so a translator can
 * work on them without reading TypeScript. A key missing from one language
 * falls back to Portuguese, then to the key itself, which shows up on screen
 * and is easy to spot.
 */
import { useSyncExternalStore } from "react";
import pt from "./locales/pt.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import { keyLabel } from "../app/os";

export type UiLang = "pt" | "en" | "es";
export const UI_LANGS: UiLang[] = ["pt", "en", "es"];

const tables: Record<UiLang, Record<string, string>> = { pt, en, es };

let current: UiLang = "pt";
const listeners = new Set<() => void>();

export const getUiLang = () => current;

export const setUiLang = (lang: UiLang) => {
  if (!UI_LANGS.includes(lang) || lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
};

export type Params = Record<string, string | number>;

/** Fills a template's {name} slots; a slot with no param stays as written. */
export const fill = (template: string, params: Params = {}): string =>
  template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));

/** A string in a given language, whatever the interface is in. */
export const translate = (lang: UiLang, key: string, params: Params = {}): string =>
  fill(tables[lang][key] ?? tables.pt[key] ?? key, params);

/** A string in the interface's language, its shortcuts written as this system writes them. */
export const t = (key: string, params: Params = {}): string => keyLabel(translate(current, key, params));

/** Re-renders a component when the interface language changes. */
export const useUiLang = (): UiLang =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );

export const hasKey = (key: string) => key in tables[current] || key in tables.pt;
