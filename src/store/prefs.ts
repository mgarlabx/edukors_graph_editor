/**
 * Preferences, mirroring the player's config.php so that what is calibrated in
 * the editor -- the judge's exact slug, its confidence floor -- is what goes into
 * production. The key is not here: it lives in the Keychain, and the webview
 * only ever learns whether there is one.
 */
import { create } from "zustand";
import { native } from "../app/platform";
import { syncMenu } from "../app/menu";
import { setUiLang, type UiLang } from "../i18n";

export interface Prefs {
  uiLang: UiLang;
  theme: "system" | "light" | "dark";
  ai: { model: string; temperature: number; maxTokens: number; timeout: number; url: string };
  judge: { model: string; minConfidence: number; strictModel: boolean; url: string; timeout: number };
  /**
   * the AI agent of the side panel: what its composer was left with, the panel's width, the person's
   * standing instructions, and their MCP servers (the text of a .mcp.json, see src/agent/mcpConfig.ts)
   */
  agent: { model: string; effort: string; mode: "ask" | "auto"; width: number; instructions: string; mcp: string };
  /** the widths of the right side panels, as last dragged: the inspector's and the preview's */
  sidebar: { inspector: number; preview: number };
  /** whether the content editor breaks long lines at its edge */
  editorWrap: boolean;
  recent: string[];
  /** the version of the terms of use the person accepted ("" before they do: see src/app/TermsModal.tsx) */
  terms: string;
}

export const DEFAULT_PREFS: Prefs = {
  uiLang: "pt",
  theme: "system",
  ai: {
    model: "openai/gpt-5.6-luna",
    temperature: 0.7,
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
  agent: { model: "default", effort: "auto", mode: "ask", width: 420, instructions: "", mcp: "" },
  sidebar: { inspector: 420, preview: 440 },
  editorWrap: true,
  recent: [],
  terms: "",
};

interface PrefsState extends Prefs {
  loaded: boolean;
  hasKey: boolean;
  load(): Promise<void>;
  save(change: Partial<Prefs>): Promise<void>;
  addRecent(path: string): Promise<void>;
  refreshKey(): Promise<void>;
}

const merge = (raw: Record<string, unknown>): Prefs => {
  const r = raw as Partial<Prefs>;
  return {
    ...DEFAULT_PREFS,
    ...r,
    ai: { ...DEFAULT_PREFS.ai, ...(r.ai ?? {}) },
    // The exact slug and the decisions endpoint are no longer preferences: whatever an older version saved, the server's are used.
    judge: { ...DEFAULT_PREFS.judge, ...(r.judge ?? {}), strictModel: true, url: DEFAULT_PREFS.judge.url },
    agent: { ...DEFAULT_PREFS.agent, ...(r.agent ?? {}) },
    sidebar: { ...DEFAULT_PREFS.sidebar, ...(r.sidebar ?? {}) },
    editorWrap: typeof r.editorWrap === "boolean" ? r.editorWrap : DEFAULT_PREFS.editorWrap,
    recent: Array.isArray(r.recent) ? r.recent.filter((p) => typeof p === "string") : [],
    terms: typeof r.terms === "string" ? r.terms : "",
  };
};

const persisted = (s: PrefsState): Prefs => ({
  uiLang: s.uiLang,
  theme: s.theme,
  ai: s.ai,
  judge: s.judge,
  agent: s.agent,
  sidebar: s.sidebar,
  editorWrap: s.editorWrap,
  recent: s.recent,
  terms: s.terms,
});

export const applyTheme = (theme: Prefs["theme"]) => {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
};

export const usePrefs = create<PrefsState>()((set, get) => ({
  ...DEFAULT_PREFS,
  loaded: false,
  hasKey: false,

  async load() {
    let raw: Record<string, unknown> = {};
    try {
      raw = await native.prefsLoad();
    } catch {
      /* first run */
    }
    const prefs = merge(raw);
    set({ ...prefs, loaded: true });
    setUiLang(prefs.uiLang);
    applyTheme(prefs.theme);
    syncMenu();
    await get().refreshKey();
  },

  async save(change) {
    set(change as Partial<PrefsState>);
    const s = get();
    if (change.uiLang) setUiLang(change.uiLang);
    // The native menu carries both the language and the recent files.
    if (change.uiLang || change.recent) syncMenu();
    if (change.theme) applyTheme(change.theme);
    await native.prefsSave(persisted(s));
  },

  async addRecent(path) {
    const recent = [path, ...get().recent.filter((p) => p !== path)].slice(0, 10);
    await get().save({ recent });
  },

  async refreshKey() {
    try {
      set({ hasKey: await native.keyStatus() });
    } catch {
      set({ hasKey: false });
    }
  },
}));

