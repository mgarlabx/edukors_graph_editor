// The real app (Electron, Common's host and shell) with every window hidden (EDUKORS_HIDDEN) and data in a temporary
// folder: nothing appears on screen and the person's own data, accounts and Recent are never touched.
//
//   node scripts/build.mjs --no-bump && node scripts/smoke-electron.mjs
//
// Checks: the page starts without errors inside Common's shell; the editor's bridge is there; an .egf opens as a course
// without a file and the map draws its nodes; the inspector is in the sidebar; Save's bytes are an .egrx that opens
// again with the same course; exporting the .egf gives back the original file, byte for byte; the original is unchanged.
import { _electron as electron } from "playwright";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = mkdtempSync(join(tmpdir(), "graph-smoke-"));
// A course with a place for every step (nothing to lay out), so exporting it must give back its exact bytes.
const GRAPH = process.env.EDUKORS_GRAPH ?? join(ROOT, "..", "edukors_graph");
const sample = existsSync(join(GRAPH, "samples", "02_05_images.egf")) ? join(GRAPH, "samples", "02_05_images.egf") : join(ROOT, "samples", "world-cats-2-short-course.json");
const before = createHash("sha256").update(readFileSync(sample)).digest("hex");
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const app = await electron.launch({
  executablePath: join(ROOT, "node_modules", "electron", "dist", process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : process.platform === "win32" ? "electron.exe" : "electron"),
  args: [ROOT, "--data-dir", data],
  // GRAPH_SMOKE_VISIBLE=1 shows the window (CI on Windows: there a window never shown is not painted, so the map
  // cannot measure its steps).
  env: { ...process.env, ...(process.env.GRAPH_SMOKE_VISIBLE ? {} : { EDUKORS_HIDDEN: "1", GRAPH_HIDDEN: "1" }), GRAPH_DATA_DIR: join(data, "graph"), EDUKORS_ACCEPT_TERMS: "1", EDUKORS_NO_UPDATES: "1" },
});
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.waitForFunction(() => !!globalThis.EdukorsAppDocument && !!document.querySelector(".graph-root"), null, { timeout: 30000 });
  check("page starts inside Common's shell", !!(await page.$(".app-shell")));
  check("editor's bridge (window.graph)", await page.evaluate(() => typeof globalThis.graph?.invoke === "function"));
  check("Common's bridge (EdukorsDesktop)", await page.evaluate(() => !!globalThis.EdukorsDesktop?.files));
  const separators = await page.$$eval(".toolbar .separator", (n) => n.filter((e) => !e.hidden && getComputedStyle(e).display !== "none").length);
  check("start screen: one separator in the toolbar", separators === 1, `${separators} visible`);

  // Open: what Common's Open does with an .egf (importFile, then adopt into a new tab).
  const text = readFileSync(sample, "utf8");
  await page.evaluate(async (raw) => {
    const bytes = new TextEncoder().encode(raw);
    const content = await EdukorsAppDocument.importFile({ format: "egf", name: "world-cats-2-short-course", extension: ".egf", bytes });
    const doc = EdukorsDocuments.add({ name: "world-cats-2-short-course", folder: "/tmp", origin: "/tmp/world-cats-2-short-course.egf" });
    EdukorsAppDocument.adopt(doc, content);
    EdukorsDocuments.activate(doc.id);
  }, text);
  await page.waitForSelector(".react-flow__node", { timeout: 20000 });
  await page.waitForTimeout(1500);
  if (process.env.GRAPH_SHOT) await page.screenshot({ path: process.env.GRAPH_SHOT });
  const ids = JSON.parse(text).nodes.map((n) => n.id);
  // The map frames the course once it is laid out; until then some steps may be outside the view, and not drawn.
  await page.waitForFunction((ids) => { const on = new Set([...document.querySelectorAll(".react-flow__node")].map((e) => e.getAttribute("data-id"))); return ids.every((id) => on.has(id)); }, ids, { timeout: 10000 }).catch(() => undefined);
  const drawn = new Set(await page.$$eval(".react-flow__node", (n) => n.map((e) => e.getAttribute("data-id"))));
  const view = await page.evaluate(() => {
    const flow = document.querySelector(".react-flow")?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll(".react-flow__node")].map((e) => { const r = e.getBoundingClientRect(); return `${e.getAttribute("data-id")}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; });
    return { window: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, flow: flow && `${Math.round(flow.width)}x${Math.round(flow.height)}`, transform: document.querySelector(".react-flow__viewport")?.style.transform, nodes };
  });
  check("the map draws every step of the course", ids.every((id) => drawn.has(id)), `${ids.filter((id) => drawn.has(id)).length}/${ids.length} ${JSON.stringify(view)}`);
  if (process.env.GRAPH_SHOT_DIR) await page.screenshot({ path: join(process.env.GRAPH_SHOT_DIR, "map.png") });
  check("the sidebar starts closed", await page.evaluate(() => document.querySelector('.toolbar [data-command="sidebar"]')?.getAttribute("aria-pressed") !== "true"));
  await page.click(`.react-flow__node[data-id="${ids[0]}"]`, { force: true });
  await page.waitForTimeout(300);
  const editable = await page.evaluate(() => ["cut", "copy", "paste", "duplicate", "delete"].filter((k) => document.querySelector(`.toolbar [data-command="${k}"]`)?.getAttribute("aria-disabled") !== "true"));
  check("a node selected: cut, copy, paste, duplicate and delete available", editable.length === 5, editable.join(","));
  check("one tab, marked as not saved (an import)", await page.evaluate(() => EdukorsDocuments.list().length === 1 && EdukorsDocuments.isModified(EdukorsDocuments.active())));
  check("inspector in the sidebar", !!(await page.$("#sidebar-panel .graph-sidebar .inspector, #sidebar-panel .graph-sidebar [class*=insp]")));

  // Windows and Linux have no menu bar: Common's page gives them Undo and Redo with Ctrl (on macOS the menu does, and
  // synthetic keys do not reach its accelerators). The step deleted with the keyboard comes back and goes again.
  if (process.platform !== "darwin" || process.env.GRAPH_SMOKE_CTRL) {
    const has = () => page.evaluate((id) => !!document.querySelector(`.react-flow__node[data-id="${id}"]`), ids[0]);
    const settle = () => page.waitForTimeout(400);
    await page.keyboard.press("Delete"); await settle();
    const deleted = !(await has());
    await page.keyboard.press("Control+z"); await settle();
    const undone = await has();
    await page.keyboard.press("Control+y"); await settle();
    const redone = !(await has());
    await page.keyboard.press("Control+Shift+z"); await settle();
    await page.keyboard.press("Control+z"); await settle();
    check("Ctrl+Z, Ctrl+Y on the map (Windows and Linux)", deleted && undone && redone && (await has()), JSON.stringify({ deleted, undone, redone }));
  }

  // Save: the bytes Common writes are an .egrx that opens again with the same course.
  const round = await page.evaluate(async () => {
    const doc = EdukorsDocuments.active();
    const { bytes } = await EdukorsAppDocument.toBytes(doc, { name: "x" });
    const back = await EdukorsAppDocument.fromBytes(bytes);
    return { zip: bytes[0] === 0x50 && bytes[1] === 0x4b, nodes: back.course.nodes.length };
  });
  check("Save writes an .egrx package", round.zip);
  check(".egrx opens again with the same course", round.nodes === JSON.parse(text).nodes.length);
  check("the original file is unchanged", createHash("sha256").update(readFileSync(sample)).digest("hex") === before);
  // Save for real, through Common's host: an .egrx in the test folder.
  const saved = await page.evaluate(async (folder) => {
    const doc = EdukorsDocuments.active();
    const { bytes } = await EdukorsAppDocument.toBytes(doc, { name: "curso" });
    return EdukorsDesktop.files.save({ folder, name: "curso", extension: ".egrx", bytes, replace: true });
  }, data);
  check("Common's host writes the .egrx", !saved.error && existsSync(join(data, "curso.egrx")), saved.error ?? "");

  // Export on Common's export screen: the course (now with its .egrx) exported as .egf next to it, with its name; the
  // file is the original course, byte for byte.
  await page.evaluate((folder) => { const doc = EdukorsDocuments.active(); Object.assign(doc, { saved: true, name: "curso", folder, file: "curso.egrx", path: folder + "/curso.egrx" }); }, data);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("graph:command", { detail: "export" })));
  await page.waitForSelector("dialog[open] .file-formats", { timeout: 10000 }).catch(() => undefined);
  const formats = await page.$$eval("dialog[open] .file-format strong", (n) => n.map((e) => e.textContent));
  check("Export opens Common's export screen with both formats", formats.length === 2, JSON.stringify(formats));
  await page.click("dialog[open] .file-footer button.primary").catch(() => undefined);
  for (let i = 0; i < 30 && !existsSync(join(data, "curso.egf")); i++) await page.waitForTimeout(200);
  const exported = existsSync(join(data, "curso.egf")) ? readFileSync(join(data, "curso.egf"), "utf8") : null;
  // Byte for byte when every step already had its place on the map; a course without places gets them from the map's
  // layout (as in 2.20), and is otherwise the same.
  const unplaced = (raw) => { const c = JSON.parse(raw); return JSON.stringify({ ...c, nodes: c.nodes.map(({ position, ...n }) => n) }); };
  const placedNow = exported !== null && JSON.parse(exported).nodes.every((n) => n.position);
  const asItCame = exported === text || (placedNow && JSON.parse(text).nodes.some((n) => !n.position) && unplaced(exported) === unplaced(text));
  check("Export .egf writes the course as it came, next to its .egrx", asItCame, exported === null ? "not written" : `${exported.length} vs ${text.length} chars${exported === text ? "" : ", positions added by the layout"}`);
  await page.keyboard.press("Escape");

  // The other views: the EGF tab (Monaco and its workers) and the preview (the player in its frame).
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("graph:command", { detail: "tab-json" })));
  await page.waitForSelector(".monaco-editor", { timeout: 20000 }).catch(() => undefined);
  check("EGF tab (Monaco)", !!(await page.$(".monaco-editor")));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("graph:command", { detail: "tab-preview" })));
  await page.waitForSelector("iframe", { timeout: 20000 }).catch(() => undefined);
  let played = false;
  for (let i = 0; i < 30 && !played; i++) {
    await page.waitForTimeout(300);
    for (const f of page.frames()) if (f.url().startsWith("graph-frame:") && (await f.evaluate(() => document.body?.innerText || "").catch(() => "")).includes("Cats of the World")) played = true;
  }
  check("Preview: the player runs in its own frame (graph-frame:), under the page's strict CSP", played);
  if (process.env.GRAPH_SHOT) await page.screenshot({ path: process.env.GRAPH_SHOT.replace(/\.png$/, "-preview.png") });

  // Common's AI assistant panel opens beside the course.
  await page.click('.toolbar [data-command="assistant"]').catch(() => undefined);
  await page.waitForTimeout(800);
  check("AI assistant panel (Common)", await page.evaluate(() => !!document.querySelector("#assistant-panel:not([inert]), .ai-panel")));
  check("the page has its strict CSP", await page.evaluate(() => /script-src 'self'/.test(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "")));
  check("no errors in the page", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  check("smoke run", false, String(e?.stack || e));
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
