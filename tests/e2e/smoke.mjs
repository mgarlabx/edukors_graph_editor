// UI smoke test in WebKit (the engine Tauri uses on macOS), against `npm run dev`.
//   node tests/e2e/smoke.mjs [outDir]
import { webkit } from "playwright";

const out = process.argv[2] ?? "/tmp";
const url = process.env.EDITOR_URL ?? "http://localhost:1420/";
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
// WebKit reports ResizeObserver's benign "loop completed" notice as an error.
page.on("pageerror", (e) => !/ResizeObserver loop/.test(e.message) && !String(e.stack).includes("web-inspector://") && problems.push(`pageerror: ${e.message}`));
const nodeCount = () => page.evaluate(() => window.__editor.getState().course.nodes.length);
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png` });
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`FAIL ${name}`);
  }
};

await page.goto(url);
await step("welcome", async () => {
  await page.getByText("Edukors Graph Editor").first().waitFor();
  await shot("01-welcome");
});
await step("open sample 3", async () => {
  await page.getByRole("button", { name: "world-cats-3-full" }).click();
  await page.locator(".card-node").first().waitFor();
  await page.waitForTimeout(1500);
  await shot("02-canvas");
});
await step("counts", async () => {
  const cards = await page.locator(".card-node").count();
  const diamonds = await page.locator(".diamond-node").count();
  const edges = await page.locator(".react-flow__edge").count();
  console.log(`     cards=${cards} diamonds=${diamonds} edges=${edges} (rendered)`);
  if ((await nodeCount()) !== 16) throw new Error("expected 16 nodes in the store");
});
await step("select quiz node", async () => {
  await page.locator(".card-node", { hasText: "q1" }).click();
  await page.locator(".inspector").getByText("Quiz").first().waitFor();
  await shot("03-inspector-quiz");
});
await step("select score node", async () => {
  await page.locator(".diamond-node", { hasText: "s1" }).click();
  await page.locator(".inspector").getByText("Testar julgamento").first().waitFor();
  await shot("04-inspector-score");
});
await step("select an edge", async () => {
  await page.evaluate(() => window.__editor.getState().reveal({ edge: 7 }));
  await page.waitForTimeout(700);
  await page.locator(".edge-label", { hasText: "q1.percent" }).first().click();
  await page.locator(".cond-row").first().waitFor();
  await shot("05-edge");
});
await step("problems panel", async () => {
  await page.locator(".badge").click();
  await page.locator(".problem-list, .bottom-panel").first().waitFor();
  await shot("06-problems");
});
await step("json tab", async () => {
  await page.getByRole("tab", { name: "JSON" }).click();
  await page.locator(".monaco-editor").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot("08-json");
});
await step("preview tab", async () => {
  await page.getByRole("tab", { name: "Preview" }).click();
  // With no key, the preview first asks for one.
  await page.locator(".modal").waitFor({ timeout: 3000 });
  await shot("09a-asks-for-key");
  await page.keyboard.press("Escape");
  const frame = page.frameLocator(".preview-frame");
  await frame.locator(".edukors-player-welcome, .edukors-player-step").first().waitFor({ timeout: 15000 });
  await frame.locator('[data-action="start"]').click();
  await frame.locator(".edukors-player-step").first().waitFor();
  await page.waitForTimeout(500);
  await shot("09-preview");
});
await step("preview advances and reports state", async () => {
  const frame = page.frameLocator(".preview-frame");
  await frame.locator('[data-action="complete"]').click();
  await page.waitForTimeout(600);
  await page.getByRole("tab", { name: "Estado" }).click();
  await page.getByRole("tab", { name: "Caminho" }).click();
  await page.locator(".path-list li").first().waitFor();
  await shot("10-preview-path");
});
await step("prefs opens", async () => {
  await page.getByRole("button", { name: /Preferências/ }).click();
  await page.locator(".modal").waitFor();
  await shot("13-prefs");
  await page.keyboard.press("Escape");
});
await step("insert node from the + list", async () => {
  await page.getByRole("button", { name: "Inserir nó" }).click();
  await page.getByRole("menuitem", { name: "Nota (IA)" }).click();
  await page.waitForTimeout(500);
  if ((await nodeCount()) !== 17) throw new Error("expected 17 nodes");
  await page.locator(".diamond-node", { hasText: "s2" }).waitFor();
  await shot("14-added-node");
});
await step("undo", async () => {
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
  await page.getByRole("button", { name: /Desfazer/ }).click();
  await page.waitForTimeout(300);
  if ((await nodeCount()) !== 16) throw new Error("expected 16 after undo");
});
await step("dark theme renders", async () => {
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.waitForTimeout(200);
  await shot("15-dark");
});

console.log(problems.length ? `\nPROBLEMS:\n${problems.join("\n")}` : "\nno problems");
await browser.close();
process.exit(problems.length ? 1 : 0);
