// The data of versions up to 2.20 (Tauri), carried into this version once. Only reads the old folders, never changes
// them (they stay for going back), and never overwrites what this version already has. Marked as done in migration.json.
//
//   prefs.json  → graph-preferences.json (preview AI, judge, content editor, panel widths)
//               → ai-settings.json, Common's AI settings of this app (instructions, MCP servers, account, models, mode)
//               → terms.json (the terms already accepted) and recent.json (the recent courses still there), Common's
//               → seed: language, theme and assistant width, for the page to apply once
//   agent/plugin/skills/<name>   → skills/<name> (Common's skills folder)
//   agent/history/<id>.json      → legacy-conversations/ (copied whole; attached to a course when its .egf is opened)
//   agent/codex, agent/antigravity, the OpenRouter key: not carried (the key is asked again; the old entry stays).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicWrite } from "./files";

export const MIGRATION_VERSION = 1;
const IDENTIFIER = "org.edukors.grapheditor";

/** Where 2.20 kept its preferences (config) and its agent folder (data), per system. */
export function legacyFolders(platform = process.platform, env = process.env, home = os.homedir()) {
  // The paths of that system, whichever system this runs on (the tests ask for all three).
  const p = platform === "win32" ? path.win32 : path.posix;
  if (platform === "darwin") { const d = p.join(home, "Library", "Application Support", IDENTIFIER); return { config: d, data: d }; }
  if (platform === "win32") { const d = p.join(env.APPDATA || p.join(home, "AppData", "Roaming"), IDENTIFIER); return { config: d, data: d }; }
  return {
    config: p.join(env.XDG_CONFIG_HOME && p.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : p.join(home, ".config"), IDENTIFIER),
    data: p.join(env.XDG_DATA_HOME && p.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : p.join(home, ".local", "share"), IDENTIFIER),
  };
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);
const readJson = async (p: string) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return null; } };
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);
const prune = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** What 2.20's prefs.json becomes here; every field checked, anything unexpected left out. */
export function mapLegacyPrefs(raw: unknown) {
  const p = obj(raw), ai = obj(p.ai), judge = obj(p.judge), agent = obj(p.agent), sidebar = obj(p.sidebar);
  const graph = prune({
    ai: Object.keys(ai).length ? prune({ model: str(ai.model, 200), maxTokens: num(ai.maxTokens, 1, 1_000_000), timeout: num(ai.timeout, 1, 600), url: str(ai.url, 500) }) : undefined,
    judge: Object.keys(judge).length ? prune({ model: str(judge.model, 200), minConfidence: num(judge.minConfidence, 0, 1), timeout: num(judge.timeout, 1, 600) }) : undefined,
    editorWrap: typeof p.editorWrap === "boolean" ? p.editorWrap : undefined,
    sidebar: Object.keys(sidebar).length ? prune({ inspector: num(sidebar.inspector, 100, 2000), preview: num(sidebar.preview, 100, 2000) }) : undefined,
  });
  const choices: Record<string, { model: string; effort: string }> = {};
  for (const [id, v] of Object.entries(obj(agent.accounts)).slice(0, 50))
    if (/^[A-Za-z0-9_-]{1,64}$/.test(id) && typeof v?.model === "string") choices[id] = { model: v.model.slice(0, 200), effort: typeof v.effort === "string" ? v.effort.slice(0, 50) : "" };
  const aiSettings = prune({
    instructions: str(agent.instructions, 20_000),
    mcp: str(agent.mcp, 100_000),
    defaultAccountId: typeof agent.account === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(agent.account) ? agent.account : undefined,
    choices: Object.keys(choices).length ? choices : undefined,
    mode: agent.mode === "auto" || agent.mode === "ask" ? agent.mode : undefined,
  });
  const seed = prune({
    language: ["pt", "en", "es"].includes(p.uiLang) ? (p.uiLang as string) : undefined,
    theme: ["system", "light", "dark"].includes(p.theme) ? (p.theme as string) : undefined,
    terms: str(p.terms, 100),
    recent: Array.isArray(p.recent) ? p.recent.filter((r: unknown) => typeof r === "string" && r.length < 4096).slice(0, 10) : undefined,
    assistantWidth: num(agent.width, 200, 2000),
  });
  return { graph, aiSettings, seed };
}

async function copyTree(from: string, to: string, onlyNew: boolean) {
  const copied: string[] = [];
  for (const entry of await fs.readdir(from, { withFileTypes: true }).catch(() => [])) {
    if (entry.isSymbolicLink()) continue;
    const src = path.join(from, entry.name), dst = path.join(to, entry.name);
    if (onlyNew && (await exists(dst))) continue;
    if (entry.isDirectory()) { await fs.cp(src, dst, { recursive: true, dereference: false, errorOnExist: false, force: false }); copied.push(entry.name); }
    else if (entry.isFile()) { await fs.mkdir(to, { recursive: true }); await fs.copyFile(src, dst); copied.push(entry.name); }
  }
  return copied;
}

/** dataDir: Common's folder of this app (terms, Recent, AI settings, skills); graphDir: the editor's own (its preferences). */
export async function migrateLegacy({ dataDir, graphDir = dataDir, legacyDir }: { dataDir: string; graphDir?: string; legacyDir?: string }) {
  const marker = path.join(dataDir, "migration.json");
  if (await exists(marker)) return { skipped: true as const };
  const folders = legacyDir ? { config: legacyDir, data: legacyDir } : legacyFolders();
  const report: Record<string, unknown> = { version: MIGRATION_VERSION, at: new Date().toISOString(), from: folders };
  const raw = await readJson(path.join(folders.config, "prefs.json"));
  if (raw) {
    const { graph, aiSettings, seed } = mapLegacyPrefs(raw);
    const graphFile = path.join(graphDir, "graph-preferences.json");
    if (!(await exists(graphFile))) { await atomicWrite(graphFile, JSON.stringify({ ...graph, seed }, null, 2)); report.preferences = true; }
    // Common's own files: the terms accepted in 2.20 (same text, same version) and the recent courses still on disk.
    const termsFile = path.join(dataDir, "terms.json");
    if (seed.terms && !(await exists(termsFile))) { await atomicWrite(termsFile, JSON.stringify({ accepted: seed.terms, at: new Date().toISOString(), from: "2.20" }, null, 2)); report.terms = seed.terms; }
    const recentFile = path.join(dataDir, "recent.json");
    if (seed.recent?.length && !(await exists(recentFile))) {
      const now = Date.now(), recent = [];
      for (const [i, file] of seed.recent.entries()) if (path.isAbsolute(file) && /\.(egf|json|egrx)$/i.test(file) && (await exists(file))) recent.push({ path: file, time: now - i });
      if (recent.length) { await atomicWrite(recentFile, JSON.stringify({ recent }, null, 2)); report.recent = recent.length; }
    }
    const aiFile = path.join(dataDir, "ai-settings.json");
    if (Object.keys(aiSettings).length && !(await exists(aiFile))) { await atomicWrite(aiFile, JSON.stringify(aiSettings, null, 2)); report.aiSettings = true; }
  }
  report.skills = await copyTree(path.join(folders.data, "agent", "plugin", "skills"), path.join(dataDir, "skills"), true);
  report.conversations = (await copyTree(path.join(folders.data, "agent", "history"), path.join(dataDir, "legacy-conversations"), true)).length;
  await atomicWrite(marker, JSON.stringify(report, null, 2));
  return report;
}

/**
 * The conversations 2.19-2.20 kept about a course file (legacy-conversations/, copied by migrateLegacy): their bodies,
 * whole, as JSON bytes, for the course's .egrx to keep. null when there are none.
 */
export async function legacyConversationsFor(dataDir: string, coursePath: string): Promise<Uint8Array | null> {
  const dir = path.join(dataDir, "legacy-conversations");
  const bodies: unknown[] = [];
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith(".meta.json")) continue;
    const meta = await readJson(path.join(dir, name));
    if (!meta || meta.coursePath !== coursePath) continue;
    const body = await readJson(path.join(dir, name.replace(/\.meta\.json$/, ".json")));
    if (body) bodies.push(body);
  }
  return bodies.length ? new TextEncoder().encode(JSON.stringify(bodies)) : null;
}
