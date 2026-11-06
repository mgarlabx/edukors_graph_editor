// Main process: the shared Electron host of Edukors Common (window, files, Recent, drafts, AI, menu, terms, updates)
// plus what only the Graph Editor needs, reached by the page through window.graph (preload.ts, registered on the main
// session next to Common's preload) and checked to come from the app's own page on every call:
//   - the preview's AI: OpenRouter requests with the key kept here (the page only learns whether there is one);
//   - the editor's own preferences (preview AI and judge, content editor);
//   - exports: the course as .egf and the standalone player (HTML);
//   - full screen for Present; the one-time migration of the data of versions up to 2.20 (legacy.ts).
import { app, BrowserWindow, ipcMain, protocol, safeStorage, session } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startDesktopApp } from "edukors-common-ux/desktop/host.mjs";
import { legacyConversationsFor, migrateLegacy } from "./legacy";
import { assertExportTarget, atomicWrite } from "./files";
import { isOpenRouterUrl } from "./openrouter";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "..");
const page = "dist/index.html", pageUrl = pathToFileURL(path.join(root, page)).href;
app.setName("Edukors Graph Editor");
// The editor's frames (the preview's player, the course map, the inspector's HTML previews) come from their own scheme:
// a srcdoc frame would inherit the page's strict CSP, which the player (inline scripts, KaTeX from cdnjs) cannot run under.
protocol.registerSchemesAsPrivileged([{ scheme: "graph-frame", privileges: { standard: true, secure: true } }]);

// GRAPH_DATA_DIR isolates a run (tests, a local test build); unpackaged runs keep their data in .local-data.
const localData = process.env.GRAPH_DATA_DIR || (!app.isPackaged ? path.join(root, ".local-data") : undefined);
if (localData) { app.setPath("userData", localData); app.setPath("sessionData", path.join(localData, "chromium")); }
if (process.env.GRAPH_HIDDEN === "1") process.env.EDUKORS_HIDDEN = "1";
const dataDir = () => app.getPath("userData");
// Where Common keeps this app's own files (terms, Recent, AI settings, skills): the user data folder when packaged;
// unpackaged, <--data-dir>/apps/graph (tests) or the development folder (desktop/host.mjs in Common).
function commonAppDir() {
  if (app.isPackaged) return app.getPath("userData");
  const at = process.argv.indexOf("--data-dir");
  if (at > 0 && process.argv[at + 1]) return path.join(path.resolve(process.argv[at + 1]), "apps", "graph");
  const shared = process.platform === "darwin" ? path.join(app.getPath("home"), "Library", "Application Support", "EDUKORS") : process.platform === "win32" ? path.join(process.env.LOCALAPPDATA || path.join(app.getPath("home"), "AppData", "Local"), "EDUKORS") : path.join(process.env.XDG_DATA_HOME || path.join(app.getPath("home"), ".local", "share"), "edukors");
  return path.join(path.dirname(shared), `${path.basename(shared)}-dev`, "apps", "graph");
}

// ---------- Preferences of the editor (Common keeps language, theme and the AI assistant's) ----------
export interface GraphPrefs {
  ai: { model: string; maxTokens: number; timeout: number; url: string };
  judge: { model: string; minConfidence: number; timeout: number };
  editorWrap: boolean;
  sidebar: { inspector: number; preview: number };
}
const prefsFile = () => path.join(dataDir(), "graph-preferences.json");
async function readPrefs(): Promise<Partial<GraphPrefs>> {
  try { const v = JSON.parse(await fs.readFile(prefsFile(), "utf8")); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

// ---------- The OpenRouter key: encrypted by the system (safeStorage), never sent to the page ----------
const keyFile = () => path.join(dataDir(), "openrouter.key");
async function readKey(): Promise<string | null> {
  try { const data = await fs.readFile(keyFile()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : null; } catch { return null; }
}

const trusted = (event: Electron.IpcMainInvokeEvent) => event.senderFrame === event.sender.mainFrame && event.senderFrame?.url.split("#")[0] === pageUrl;
function handle(name: string, fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) {
  ipcMain.handle("graph:" + name, async (event, ...args) => { if (!trusted(event)) throw Error("Untrusted IPC sender."); return fn(event, ...args); });
}

handle("prefsLoad", () => readPrefs());
handle("prefsSave", async (_e, prefs: unknown) => {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs) || JSON.stringify(prefs).length > 100_000) throw Error("Invalid preferences.");
  await atomicWrite(prefsFile(), JSON.stringify(prefs, null, 2));
});
handle("keyStatus", async () => !!(await readKey()));
handle("keySet", async (_e, key: unknown) => {
  if (typeof key !== "string" || !key.trim() || key.length > 500) throw Error("Invalid key.");
  if (!safeStorage.isEncryptionAvailable()) throw Error("This system has no secure storage for the key.");
  await atomicWrite(keyFile(), safeStorage.encryptString(key.trim()));
});
handle("keyDelete", async () => { await fs.rm(keyFile(), { force: true }); });

// One POST to OpenRouter with the key; only OpenRouter's addresses (the same rule as the Rust side of 2.20).
handle("aiPost", async (_e, url: unknown, body: unknown, timeout: unknown) => {
  if (typeof url !== "string" || !isOpenRouterUrl(url)) throw Error(`refused: ${url} is not an OpenRouter address`);
  const key = await readKey();
  if (!key) throw Error("no OpenRouter key");
  const started = Date.now(), seconds = typeof timeout === "number" && timeout > 0 && timeout <= 600 ? timeout : 45;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Edukors Graph Editor" }, body: JSON.stringify(body), signal: AbortSignal.timeout(seconds * 1000) });
    const raw = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(raw); } catch { /* unreadable */ }
    const error = json === null ? "unreadable answer" : res.status >= 400 ? String((json as any)?.error?.message ?? `request failed (${res.status})`) : null;
    return { status: res.status, json, raw, error, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, json: null, raw: "", error: String(e), ms: Date.now() - started };
  }
});
handle("aiModels", async () => (await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(30000) })).json());

// ---------- Exports ----------
const windowOf = (event: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender) ?? undefined;
let exporting = false;
/**
 * The course as an .egf or the standalone player (HTML), from Common's export screen: next to the course's file, with
 * its name (the screen chose both). An existing file is replaced only after the screen asked ({ exists: true } first).
 * Never over the course's own .egrx (protect) nor over any .egrx.
 */
handle("export", async (_event, request: { kind: "egf" | "html"; name?: string; folder?: string; text: string; replace?: boolean; protect?: string[] }) => {
  if (exporting) throw Error("An export is already running.");
  if (!request || (request.kind !== "egf" && request.kind !== "html") || typeof request.text !== "string" || request.text.length > 200 * 2 ** 20) throw Error("Nothing to export.");
  const name = typeof request.name === "string" ? request.name.trim() : "";
  if (!/^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/.test(name) || /^\.+$/.test(name)) throw Error("Invalid export name.");
  if (typeof request.folder !== "string" || !path.isAbsolute(request.folder) || !existsSync(request.folder)) throw Error("The folder of the export is not there.");
  const file = path.join(request.folder, `${name}.${request.kind}`);
  if (request.replace !== true && existsSync(file)) return { exists: true };
  exporting = true;
  try {
    await assertExportTarget(file, (request.protect ?? []).filter((p) => typeof p === "string"));
    await atomicWrite(file, request.text);
    return { file };
  } finally {
    exporting = false;
  }
});

// ---------- Frames: each document a frame shows, kept here and served from graph-frame://doc/<id> ----------
// As in 2.20, the frames' own documents have no CSP of their own (course content may load https resources); they run
// sandboxed (opaque origin, no bridge: the preload exposes window.graph only on the app's page).
const frames = new Map<string, string>();
let frameSeq = 0;
handle("frame", (_e, html: unknown, previous: unknown) => {
  if (typeof html !== "string" || html.length > 100 * 2 ** 20) throw Error("Invalid frame.");
  if (typeof previous === "string") frames.delete(previous);
  const id = `f${++frameSeq}`;
  frames.set(id, html);
  return { id, url: `graph-frame://doc/${id}` };
});
handle("frameForget", (_e, id: unknown) => { if (typeof id === "string") frames.delete(id); });

// ---------- Conversations of 2.19-2.20 about a course file, for its .egrx ----------
handle("legacyConversations", async (_e, coursePath: unknown) => (typeof coursePath === "string" && path.isAbsolute(coursePath) ? legacyConversationsFor(commonAppDir(), coursePath) : null));

// ---------- Present: the preview alone, in full screen ----------
handle("fullScreen", (event, on: unknown) => { const w = windowOf(event); if (w) w.setFullScreen(on === true); return w?.isFullScreen() ?? false; });

// ---------- Before Common's own ready handler creates the window ----------
app.whenReady().then(async () => {
  protocol.handle("graph-frame", (request) => {
    const html = frames.get(new URL(request.url).pathname.replace(/^\//, ""));
    return html === undefined ? new Response("", { status: 404 }) : new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  });
  session.defaultSession.registerPreloadScript({ type: "frame", id: "edukors-graph", filePath: path.join(here, "preload.cjs") });
  if (app.isPackaged || process.env.GRAPH_LEGACY_DIR) {
    try { await migrateLegacy({ dataDir: commonAppDir(), graphDir: dataDir(), legacyDir: process.env.GRAPH_LEGACY_DIR }); } catch (e) { process.stderr.write(`[warn] legacy data: ${(e as Error).message}\n`); }
  }
});

startDesktopApp({
  appId: "graph", name: "Edukors Graph Editor", root, page,
  documentExtensions: [".egrx"],
  // Courses of the .egf format (and older .json ones) open as courses without a file: Save always asks for an .egrx.
  openExtensions: [".egf", ".json"],
  // Exports (.egf with links, the standalone player) are the editor's own command: they write more than one file.
  exportFormats: [],
  // Cmd+M shows the map (as in 2.20); Window → Minimize stays in the macOS menu, without the shortcut.
  minimizeShortcut: false,
});
