/**
 * The native side, behind one door.
 *
 * In the desktop app every call goes to the editor's own bridge, window.graph (src/main/preload.ts, checked again
 * in src/main/index.ts); what every Edukors app shares (files, Recent, the AI assistant, settings) is Common's,
 * reached through its own globals. In a plain browser (the headless tests, a preview of the page) the same calls
 * fall back to what a browser has, so the editor still opens, edits and validates.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Bridge = { invoke: (method: string, ...args: unknown[]) => Promise<any> };
const bridge = (): Bridge | undefined => (globalThis as any).graph;

/** Inside the desktop app (Electron, with the editor's bridge). */
export const isDesktop = (): boolean => !!bridge();

/** The links the editor hands to the computer's browser; anything else stays where it is. */
export const EXTERNAL_LINK = /^(https?:|mailto:)/i;

/** Opens a link in the computer's browser: the window itself never leaves the editor (Common's host opens it). */
export function openLink(href: string) {
  if (EXTERNAL_LINK.test(href)) window.open(href, "_blank", "noopener");
}

export interface HttpAnswer {
  status: number;
  json: unknown;
  raw: string;
  error: string | null;
  ms: number;
}

const DEV_KEY = "edukors-graph.dev-openrouter-key";
const PREFS = "edukors-graph.prefs";

const browser: Record<string, (...args: any[]) => Promise<unknown>> = {
  prefsLoad: async () => JSON.parse(localStorage.getItem(PREFS) ?? "{}"),
  prefsSave: async (prefs) => localStorage.setItem(PREFS, JSON.stringify(prefs)),
  keyStatus: async () => Boolean(localStorage.getItem(DEV_KEY)),
  keySet: async (key) => localStorage.setItem(DEV_KEY, String(key)),
  keyDelete: async () => localStorage.removeItem(DEV_KEY),
  aiModels: async () => (await fetch("https://openrouter.ai/api/v1/models")).json(),
  legacyConversations: async () => null,
  // Development only: the key sits in the browser here, which the desktop app never allows.
  aiPost: async (url, body) => {
    const key = localStorage.getItem(DEV_KEY);
    if (!key) throw new Error("no OpenRouter key");
    const started = performance.now();
    try {
      const res = await fetch(String(url), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Edukors Graph Editor" }, body: JSON.stringify(body) });
      const raw = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(raw);
      } catch {
        /* unreadable */
      }
      const error = json === null ? "unreadable answer" : res.status >= 400 ? String((json as any)?.error?.message ?? `request failed (${res.status})`) : null;
      return { status: res.status, json, raw, error, ms: Math.round(performance.now() - started) };
    } catch (e) {
      return { status: 0, json: null, raw: "", error: String(e), ms: Math.round(performance.now() - started) };
    }
  },
};

export async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const b = bridge();
  if (b) return b.invoke(method, ...args);
  const fallback = browser[method];
  if (!fallback) throw new Error(`${method} is not available outside the desktop app`);
  return (await fallback(...args)) as T;
}

export const native = {
  prefsLoad: () => call<Record<string, unknown>>("prefsLoad"),
  prefsSave: (prefs: unknown) => call<void>("prefsSave", prefs),
  keyStatus: () => call<boolean>("keyStatus"),
  keySet: (key: string) => call<void>("keySet", key),
  keyDelete: () => call<void>("keyDelete"),
  aiPost: (url: string, body: unknown, timeout?: number) => call<HttpAnswer>("aiPost", url, body, timeout),
  aiModels: () => call<{ data?: unknown[] }>("aiModels"),
  /** What 2.19-2.20 kept of the conversations about a course file (JSON bytes), or null. */
  legacyConversations: (coursePath: string) => call<Uint8Array | null>("legacyConversations", coursePath),
  /** A document for one of the editor's frames, served from graph-frame:// (replacing `previous`). */
  frame: (html: string, previous?: string) => call<{ id: string; url: string }>("frame", html, previous),
  frameForget: (id: string) => call<void>("frameForget", id),
  exportFile: (request: { kind: "egf" | "html"; name: string; folder: string; text: string; replace?: boolean; protect?: string[] }) => call<{ file: string } | { exists: true }>("export", request),
};
