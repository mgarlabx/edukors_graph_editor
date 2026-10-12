// The inspector in WebKit, against `npm run dev`: one language for every text (the map's),
// no problems in the panel (they are in the bubble of the node's card), extras on nodes and edges.
//   node tests/e2e/inspector.mjs [outDir]
import { webkit } from "playwright";
import { readFileSync } from "node:fs";
const sample = JSON.parse(readFileSync(new URL("../../samples/world-cats-3-full-course.json", import.meta.url), "utf8"));
const out = process.argv[2] ?? "/tmp";
const url = process.env.EDITOR_URL ?? "http://localhost:1420/";
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("pageerror", (e) => !/ResizeObserver loop/.test(e.message) && problems.push(e.message));
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) problems.push(what); };
await page.goto(url);
await page.getByRole("button", { name: /Aceito os termos|I accept/ }).click();
await page.getByRole("button", { name: /^(Começar|Start)$/ }).click();
await page.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), sample);
await page.locator(".card-node").first().waitFor();
const state = () => page.evaluate(() => { const s = window.__editor.getState(); return { tab: s.tab, sel: s.selection, lang: s.canvasLang }; });
await page.evaluate(() => window.__editor.getState().select({ nodes: ["q1"], edge: null }));
if (!(await page.locator(".inspector").count())) await page.evaluate(async () => (await import("/src/App.tsx")).command("sidebar"));
await page.locator(".insp-head").waitFor();

// one language for the whole inspector, shared with the map
await page.locator(".insp-langs").getByRole("radio", { name: "pt" }).click();
check((await state()).lang === "pt", "language bar sets the map's language");
check((await page.locator(".inspector .lang-mark.is-translation").count()) > 3, "every localized field shows pt");
await page.screenshot({ path: `${out}/j0-lang-pt.png` });
await page.locator(".insp-langs").getByRole("radio", { name: /en/ }).click();

// problems: not in the inspector, in a bubble over the card on the map
await page.evaluate(() => window.__editor.getState().select({ nodes: ["sm1"], edge: null }));
await page.locator(".insp-head").waitFor();
check((await page.locator(".inspector .notice, .inspector .issue-box").count()) === 0, "no problems in the inspector");
await page.locator(".card-node.has-error, .card-node.has-warning").first().hover();
await page.locator(".issue-bubble").waitFor();
check((await page.locator(".issue-bubble li").count()) > 0, "the card's bubble lists its problems");
await page.screenshot({ path: `${out}/j1-card-bubble.png` });
await page.mouse.move(5, 300);
await page.locator(".issue-bubble").waitFor({ state: "detached" });
check(true, "the bubble goes when the pointer leaves");

// extras, on a node and on an edge: the box opens the JSON editor; ⌘↵ applies it, Remover takes it away
for (const [what, sel, read] of [
  ["node", { nodes: ["dm1"], edge: null }, () => page.evaluate(() => window.__editor.getState().course.nodes.find((n) => n.id === "dm1").extras)],
  ["edge", { nodes: [], edge: 1 }, () => page.evaluate(() => window.__editor.getState().course.edges[1].extras)],
]) {
  await page.evaluate((sel) => window.__editor.getState().select(sel), sel);
  const peek = page.locator(".inspector .extras-peek");
  await peek.waitFor();
  await peek.click();
  await page.locator(".extras-editor .monaco-editor").waitFor();
  await page.waitForTimeout(400);
  await page.keyboard.type('"acme": 1');
  await page.keyboard.press("Meta+Enter");
  await page.locator(".extras-editor").waitFor({ state: "detached" });
  check(JSON.stringify(await read()) === '{"acme":1}', `extras of a ${what}: applied`);
  if (what === "edge") await page.screenshot({ path: `${out}/j3-edge-extras.png` });
  await page.locator(".inspector .extras-peek").locator("..").getByRole("button", { name: "Remover" }).click();
  check((await read()) === undefined, `extras of a ${what}: removed`);
}

console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "all good");
await browser.close();
process.exit(problems.length ? 1 : 0);
