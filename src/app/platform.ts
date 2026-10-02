/**
 * The native side, behind one door.
 *
 * In the app every call goes to the Rust commands in src-tauri/src/lib.rs. In a
 * plain browser (`npm run dev`, used to work on the interface) the same calls
 * fall back to what a browser has, so the editor still opens, edits and
 * validates; only the Keychain and the native dialogs are missing there.
 */
import { invoke } from "@tauri-apps/api/core";

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface HttpAnswer {
  status: number;
  json: unknown;
  raw: string;
  error: string | null;
  ms: number;
}

const DEV_KEY = "edukors-editor.dev-openrouter-key";
const PREFS = "edukors-editor.prefs";

const browser: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  read_text: async ({ path }) => {
    const res = await fetch(String(path));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.text();
  },
  write_text: async ({ path, contents }) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([String(contents)], { type: "application/json" }));
    a.download = String(path).split("/").pop() ?? "course.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  file_exists: async () => false,
  take_opened_files: async () => [],
  prefs_load: async () => JSON.parse(localStorage.getItem(PREFS) ?? "{}"),
  prefs_save: async ({ prefs }) => localStorage.setItem(PREFS, JSON.stringify(prefs)),
  key_status: async () => Boolean(localStorage.getItem(DEV_KEY)),
  key_set: async ({ key }) => localStorage.setItem(DEV_KEY, String(key)),
  key_delete: async () => localStorage.removeItem(DEV_KEY),
  set_menu: async () => undefined,
  ai_models: async () => (await fetch("https://openrouter.ai/api/v1/models")).json(),
  // Development only: the key sits in the browser here, which the app never allows.
  ai_post: async ({ url, body }) => {
    const key = localStorage.getItem(DEV_KEY);
    if (!key) throw new Error("no OpenRouter key");
    const started = performance.now();
    try {
      const res = await fetch(String(url), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Edukors Graph Editor" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(raw);
      } catch {
        /* unreadable */
      }
      const error =
        json === null
          ? "unreadable answer"
          : res.status >= 400
            ? String((json as { error?: { message?: string } }).error?.message ?? `request failed (${res.status})`)
            : null;
      return { status: res.status, json, raw, error, ms: Math.round(performance.now() - started) };
    } catch (e) {
      return { status: 0, json: null, raw: "", error: String(e), ms: Math.round(performance.now() - started) };
    }
  },
};

export async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) return invoke<T>(command, args);
  const fallback = browser[command];
  if (!fallback) throw new Error(`${command} is not available outside the app`);
  return (await fallback(args)) as T;
}

export const native = {
  readText: (path: string) => call<string>("read_text", { path }),
  writeText: (path: string, contents: string) => call<void>("write_text", { path, contents }),
  fileExists: (path: string) => call<boolean>("file_exists", { path }),
  takeOpenedFiles: () => call<string[]>("take_opened_files"),
  prefsLoad: () => call<Record<string, unknown>>("prefs_load"),
  prefsSave: (prefs: unknown) => call<void>("prefs_save", { prefs }),
  keyStatus: () => call<boolean>("key_status"),
  keySet: (key: string) => call<void>("key_set", { key }),
  keyDelete: () => call<void>("key_delete"),
  aiPost: (url: string, body: unknown, timeout?: number) => call<HttpAnswer>("ai_post", { url, body, timeout }),
  aiModels: () => call<{ data?: unknown[] }>("ai_models"),
  setMenu: (lang: string, recent: string[], map: { langs: string[]; current: string }) => call<void>("set_menu", { lang, recent, map }),
};

// ---------------------------------------------------------------- dialogs --

export async function pickOpen(filters = [{ name: "Edukors course", extensions: ["json"] }]): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, directory: false, filters });
    return typeof picked === "string" ? picked : null;
  }
  return null;
}

export async function pickSave(defaultPath: string, filters = [{ name: "JSON", extensions: ["json"] }]): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return (await save({ defaultPath, filters })) ?? null;
  }
  return defaultPath;
}

export async function confirmDialog(message: string, title: string, ok: string, cancel: string): Promise<boolean> {
  if (isTauri()) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(message, { title, kind: "warning", okLabel: ok, cancelLabel: cancel });
  }
  return window.confirm(message);
}

export async function alertDialog(message: string, title: string): Promise<void> {
  if (isTauri()) {
    const { message: show } = await import("@tauri-apps/plugin-dialog");
    await show(message, { title, kind: "error" });
    return;
  }
  window.alert(message);
}

/** Reads a file the user dropped or picked in a browser <input type=file>. */
export const readBrowserFile = (file: File): Promise<ArrayBuffer> => file.arrayBuffer();
