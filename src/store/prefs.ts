/**
 * The editor's own preferences, mirroring the player's config.php so that what is calibrated in the editor -- the
 * judge's exact slug, its confidence floor -- is what goes into production. The key is not here: it lives in the
 * main process (encrypted by the system), and the page only ever learns whether there is one.
 *
 * Everything every Edukors app shares is Common's: the interface language (followed here, see followLanguage), the
 * theme, the AI assistant's accounts and settings, Recent, the terms of use.
 */
import { create } from "zustand";
import { native } from "../app/platform";
import { setUiLang, type UiLang } from "../i18n";

export interface Prefs {
  /** the interface language, Common's; languages the editor does not have yet show English */
  uiLang: UiLang;
  ai: { model: string; maxTokens: number; timeout: number; url: string };
  judge: { model: string; minConfidence: number; strictModel: boolean; url: string; timeout: number };
  /** the widths of the panels beside the stage, as last dragged: the inspector's and the preview's */
  sidebar: { inspector: number; preview: number };
  /** whether the content editor breaks long lines at its edge */
  editorWrap: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  uiLang: "pt",
  ai: {
    model: "openai/gpt-5.6-luna",
    maxTokens: 1200,
    timeout: 45,
    url: "https://openrouter.ai/api/v1/chat/completions",
  },
  judge: {
    model: "typesafe/jev-1.13",
    minConfidence: 0.7,
    strictModel: true,
    url: "https://openrouter.ai/api/alpha/decisions",
    timeout: 45,
  },
  sidebar: { inspector: 420, preview: 440 },
  editorWrap: true,
};

/** What 2.20 kept and Common now applies once (src/main/legacy.ts): the page reads it on its first start. */
export interface LegacySeed {
  language?: string;
  theme?: string;
  terms?: string;
  recent?: string[];
  assistantWidth?: number;
}

interface PrefsState extends Prefs {
  loaded: boolean;
  hasKey: boolean;
  seed: LegacySeed | null;
  load(): Promise<void>;
  save(change: Partial<Omit<Prefs, "uiLang">>): Promise<void>;
  refreshKey(): Promise<void>;
  /** The seed was applied: it is not offered again. */
  dropSeed(): Promise<void>;
}

const merge = (raw: Record<string, unknown>): Omit<Prefs, "uiLang"> => {
  const r = raw as Partial<Prefs>;
  return {
    ai: (({ temperature: _, ...ai }) => ai)({ ...DEFAULT_PREFS.ai, ...(r.ai ?? {}) } as Prefs["ai"] & { temperature?: number }),
    // The exact slug and the decisions endpoint are not preferences: whatever was saved, the server's are used.
    judge: { ...DEFAULT_PREFS.judge, ...(r.judge ?? {}), strictModel: true, url: DEFAULT_PREFS.judge.url },
    sidebar: { ...DEFAULT_PREFS.sidebar, ...(r.sidebar ?? {}) },
    editorWrap: typeof r.editorWrap === "boolean" ? r.editorWrap : DEFAULT_PREFS.editorWrap,
  };
};

let raw: Record<string, unknown> = {};

export const usePrefs = create<PrefsState>()((set, get) => ({
  ...DEFAULT_PREFS,
  loaded: false,
  hasKey: false,
  seed: null,

  async load() {
    try {
      raw = await native.prefsLoad();
    } catch {
      raw = {};
    }
    const seed = raw.seed && typeof raw.seed === "object" ? (raw.seed as LegacySeed) : null;
    set({ ...merge(raw), seed, loaded: true });
    await get().refreshKey();
  },

  async save(change) {
    set(change as Partial<PrefsState>);
    const s = get();
    raw = { ...raw, ai: s.ai, judge: s.judge, sidebar: s.sidebar, editorWrap: s.editorWrap };
    await native.prefsSave(raw);
  },

  async refreshKey() {
    try {
      set({ hasKey: await native.keyStatus() });
    } catch {
      set({ hasKey: false });
    }
  },

  async dropSeed() {
    const { seed: _, ...rest } = raw;
    raw = rest;
    set({ seed: null });
    await native.prefsSave(raw);
  },
}));

/** The interface language follows Common's (Settings); pt, en and es have the editor's own texts, others show English. */
export function followLanguage() {
  const apply = () => {
    const lang = document.documentElement.lang;
    const ui: UiLang = lang === "pt" || lang === "es" || lang === "en" ? lang : "en";
    if (usePrefs.getState().uiLang !== ui) usePrefs.setState({ uiLang: ui });
    setUiLang(ui);
  };
  apply();
  document.addEventListener("edukors:preferences-changed", apply);
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}
