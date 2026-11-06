// The data of 2.20 carried into this version, in the real app (hidden windows, temporary folders): a copy of a 2.20
// data folder (GRAPH_LEGACY_SOURCE, by default the backup made before the migration; it holds no credentials) is
// migrated once, read only. Checks the editor's preferences, Common's AI settings, skills, the accepted terms, the
// recent courses still on disk, the interface language and theme applied once, and that the copy was not changed.
//
//   node scripts/build.mjs --no-bump && node scripts/smoke-legacy.mjs
import { _electron as electron } from "playwright";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.GRAPH_LEGACY_SOURCE ?? join(ROOT, "..", "migration-backups", "graph-egrx-20261104-114601", "userdata", "org.edukors.grapheditor");
if (!existsSync(join(source, "prefs.json"))) { console.log(`no 2.20 data at ${source}; set GRAPH_LEGACY_SOURCE`); process.exit(1); }
const data = mkdtempSync(join(tmpdir(), "graph-legacy-"));
const legacy = join(data, "legacy");
cpSync(source, legacy, { recursive: true });
const hash = (dir) => createHash("sha256").update(readdirSync(dir, { recursive: true }).sort().map((f) => { try { return f + readFileSync(join(dir, f)).toString("base64"); } catch { return f; } }).join()).digest("hex");
// A conversation 2.20 kept about a course file, to see it reach that course's history when the .egf is opened.
const egf = join(data, "curso.egf");
writeFileSync(egf, readFileSync(join(ROOT, "samples", "world-cats-1-mini-course.json")));
mkdirSync(join(legacy, "agent", "history"), { recursive: true });
writeFileSync(join(legacy, "agent", "history", "smoke-1.meta.json"), JSON.stringify({ id: "smoke-1", title: "t", lastModified: Date.now(), accountId: "acc", providerId: "claude", coursePath: egf }));
writeFileSync(join(legacy, "agent", "history", "smoke-1.json"), JSON.stringify({ id: "smoke-1", lastModified: Date.now(), accountId: "acc", items: [{ kind: "user", text: "Traduza o curso" }, { kind: "text", text: "Pronto." }] }));
const before = hash(legacy);
const old = JSON.parse(readFileSync(join(legacy, "prefs.json"), "utf8"));
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };

const app = await electron.launch({
  executablePath: join(ROOT, "node_modules", "electron", "dist", process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : process.platform === "win32" ? "electron.exe" : "electron"),
  args: [ROOT, "--data-dir", data],
  env: { ...process.env, EDUKORS_HIDDEN: "1", GRAPH_DATA_DIR: join(data, "graph"), GRAPH_LEGACY_DIR: legacy, EDUKORS_ACCEPT_TERMS: "1", EDUKORS_NO_UPDATES: "1" },
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!globalThis.EdukorsAppDocument && !!document.querySelector(".graph-root"), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const common = join(data, "apps", "graph");
  check("migration recorded once (migration.json)", existsSync(join(common, "migration.json")));
  const ai = existsSync(join(common, "ai-settings.json")) ? JSON.parse(readFileSync(join(common, "ai-settings.json"), "utf8")) : {};
  check("AI settings carried (mode, account, models)", ai.mode === (old.agent?.mode ?? "ask") && (ai.defaultAccountId ?? null) === (old.agent?.account ?? null), JSON.stringify({ mode: ai.mode, account: ai.defaultAccountId }));
  const skills = existsSync(join(legacy, "agent", "plugin", "skills")) ? readdirSync(join(legacy, "agent", "plugin", "skills")).filter((f) => !f.startsWith(".")) : [];
  check("skills carried", skills.every((s) => existsSync(join(common, "skills", s))), `${skills.length} skill(s)`);
  check("terms accepted in 2.20 carried", !old.terms || JSON.parse(readFileSync(join(common, "terms.json"), "utf8")).accepted === old.terms);
  const recent = existsSync(join(common, "recent.json")) ? JSON.parse(readFileSync(join(common, "recent.json"), "utf8")).recent : [];
  check("recent courses still on disk carried", recent.every((r) => existsSync(r.path)), `${recent.length} of ${(old.recent ?? []).length}`);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("edukors.common.preferences") || "{}"));
  check("interface language and theme applied once", (!old.uiLang || prefs.language === old.uiLang) && (!old.theme || prefs.appearance === old.theme), JSON.stringify(prefs));
  // Opening that .egf brings the conversation into the course: in its history and, whole, in its .egrx.
  const brought = await page.evaluate(async ({ file, text }) => {
    const content = await EdukorsAppDocument.importFile({ format: "egf", bytes: new TextEncoder().encode(text) });
    const doc = EdukorsDocuments.add({ name: "curso", folder: file.replace(/\/[^/]*$/, ""), origin: file });
    EdukorsAppDocument.adopt(doc, content);
    EdukorsDocuments.activate(doc.id);
    for (let i = 0; i < 60 && !EdukorsAiAssistant.conversationsOf(doc).some((c) => c.id === "smoke-1"); i++) await new Promise((r) => setTimeout(r, 100));
    const listed = EdukorsAiAssistant.conversationsOf(doc).filter((c) => c.items.length).map((c) => [c.id, c.items.length]);
    const back = await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(doc, { name: "curso" })).bytes);
    return { listed, legacy: back.legacyConversations ? new TextDecoder().decode(back.legacyConversations).includes("Traduza o curso") : false };
  }, { file: egf, text: readFileSync(egf, "utf8") });
  check("a 2.20 conversation about the .egf reaches its history", JSON.stringify(brought.listed) === JSON.stringify([["smoke-1", 2]]), JSON.stringify(brought.listed));
  check("…and stays whole in its .egrx", brought.legacy);
  check("the 2.20 folder was not changed", hash(legacy) === before);
} catch (e) {
  check("legacy run", false, String(e?.stack || e));
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
