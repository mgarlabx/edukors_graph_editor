// Several courses in tabs, in WebKit (the engine Tauri uses on macOS), against `npm run dev`:
// copy a node in one course, paste it into another, switch back and forth,
// type in the JSON tab right before switching, close a tab with changes.
//   node tests/e2e/tabs.mjs [outDir]
import { webkit } from "playwright";
import { readFileSync } from "node:fs";
const sample = JSON.parse(readFileSync(new URL("../../samples/world-cats-3-full-course.json", import.meta.url), "utf8"));

const out = process.argv[2] ?? "/tmp";
const url = process.env.EDITOR_URL ?? "http://localhost:1420/";
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
// WebKit reports ResizeObserver's benign "loop completed" notice as an error.
page.on("pageerror", (e) => !/ResizeObserver loop/.test(e.message) && !String(e.stack).includes("web-inspector://") && problems.push(`pageerror: ${e.message}`));
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png` });
const state = () =>
  page.evaluate(() => {
    const s = window.__editor.getState();
    return { doc: s.docId, ids: s.course?.nodes.map((n) => n.id) ?? [], selection: s.selection.nodes, tabs: window.__docs.getState().order, positions: Object.fromEntries((s.course?.nodes ?? []).filter((n) => n.position).map((n) => [n.id, n.position])), version: s.course?.info.version };
  });
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${e.message.split("\n")[0]}`);
    console.log(`FAIL ${name}`);
  }
};
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
/** The clipboard, as the canvas's own copy and paste handlers see it. */
const copyOnCanvas = () =>
  page.evaluate(() => {
    const data = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain");
  });
const pasteOnCanvas = (text) =>
  page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    return !document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);

await page.goto(url);
// The terms of use come first, on a fresh profile.
await page.getByRole("button", { name: "Aceito os termos" }).click();
// then the opening, with the version
await page.getByRole("button", { name: "Começar" }).click();
let clip = "";
let first = "";

await step("open sample 3 in a tab", async () => {
  // The welcome screen no longer lists the samples: the course is opened as a file would be.
  await page.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), sample);
  await page.locator(".card-node").first().waitFor();
  await page.waitForTimeout(1200);
  const tabs = page.getByRole("tab", { name: /Cats of the World 3/ });
  await tabs.waitFor();
  expect((await state()).tabs.length === 1, "expected one tab");
  first = (await state()).doc;
  await shot("t01-one-tab");
});

await step("copy a quiz on the canvas", async () => {
  await page.locator(".card-node", { hasText: "q1" }).click();
  await page.locator(".react-flow__pane").focus().catch(() => undefined);
  clip = await copyOnCanvas();
  expect(clip.includes('"edukors-editor/nodes": true') && clip.includes('"q1"'), "the copy did not carry the quiz");
});

await step("a new course opens in a second tab", async () => {
  await page.locator(".doc-tabs-add").click();
  await page.locator(".card-node").first().waitFor();
  const s = await state();
  expect(s.tabs.length === 2 && s.doc !== first, "expected a second tab on screen");
  expect(s.ids.join() === "sm1", `expected only sm1, got ${s.ids}`);
});

await step("paste the quiz into the new course", async () => {
  await page.locator(".react-flow__pane").click({ position: { x: 300, y: 300 } });
  expect(await pasteOnCanvas(clip), "the paste was not taken");
  await page.locator(".card-node", { hasText: "q1" }).waitFor();
  const s = await state();
  expect(s.ids.join() === "sm1,q1", `expected sm1,q1, got ${s.ids}`);
  expect(s.selection.join() === "q1", "the pasted quiz should be selected");
  expect(s.positions.q1, "the pasted quiz has no place");
  await page.locator(".doc-tab.is-active.is-dirty").waitFor();
  await shot("t02-pasted");
});

await step("back to the first course, untouched", async () => {
  await page.getByRole("tab", { name: /Cats of the World 3/ }).click();
  await page.waitForTimeout(400);
  const s = await state();
  expect(s.doc === first && s.ids.length === 16, `expected the 16 nodes of the sample, got ${s.ids.length}`);
  expect(s.selection.join() === "q1", "the first course lost its selection");
  await shot("t03-back");
});

await step("⌘2 and ⌘1 switch tabs", async () => {
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Meta+2");
  await page.waitForTimeout(300);
  expect((await state()).ids.length === 2, "⌘2 did not show the second course");
  await page.keyboard.press("Meta+1");
  await page.waitForTimeout(300);
  expect((await state()).ids.length === 16, "⌘1 did not show the first course");
  // in the app ⌃⇥ comes from the menu; in a browser, from the keyboard
  await page.keyboard.press("Control+Tab");
  await page.waitForTimeout(300);
  expect((await state()).ids.length === 2, "⌃⇥ did not go to the next tab");
  await page.keyboard.press("Control+Shift+Tab");
  await page.waitForTimeout(300);
  expect((await state()).ids.length === 16, "⇧⌃⇥ did not go back");
});

await step("dragging a tab moves it", async () => {
  const before = (await state()).tabs;
  await page.locator(".doc-tab").nth(1).dragTo(page.locator(".doc-tab").nth(0), { targetPosition: { x: 4, y: 10 } });
  await page.waitForTimeout(300);
  const after = (await state()).tabs;
  expect(after[0] === before[1] && after[1] === before[0], `the tabs did not swap: ${before} -> ${after}`);
  await page.locator(".doc-tab").nth(1).dragTo(page.locator(".doc-tab").nth(0), { targetPosition: { x: 4, y: 10 } });
  await page.waitForTimeout(300);
  expect((await state()).tabs.join() === before.join(), "the tabs did not swap back");
});

await step("typing in the JSON tab lands in its own course, even right before switching", async () => {
  await page.getByRole("tab", { name: "JSON" }).click();
  const editor = page.locator(".monaco-editor").first();
  await editor.waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  // the version line of the sample, edited in place
  await editor.click();
  await page.keyboard.press("Meta+f");
  await page.keyboard.type('"version": "');
  await page.keyboard.press("Escape");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("-tab");
  // switch at once, well inside the editor's 450 ms wait
  await page.locator(".doc-tab").nth(1).click();
  await page.waitForTimeout(800);
  const second = await state();
  expect(!String(second.version ?? "").endsWith("-tab"), `the typing went into the other course (${second.version})`);
  await page.locator(".doc-tab").nth(0).click();
  await page.waitForTimeout(500);
  const back = await state();
  expect(String(back.version ?? "").endsWith("-tab"), `the typing was lost (${back.version})`);
  await shot("t04-json");
  await page.getByRole("tab", { name: "Grafo" }).click();
});

await step("closing a tab with changes asks, naming the course", async () => {
  await page.locator(".doc-tab").nth(1).hover();
  await page.locator(".doc-tab").nth(1).locator(".doc-tab-close").click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  const text = await dialog.innerText();
  expect(text.includes("Novo curso"), `the dialog does not name the course: ${text}`);
  await shot("t05-ask");
  await dialog.getByRole("button", { name: "Descartar" }).click();
  await page.waitForTimeout(300);
  const s = await state();
  expect(s.tabs.length === 1 && s.doc === first, "the tab did not close");
});

await step("dark theme renders the tabs", async () => {
  await page.locator(".doc-tabs-add").click();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.waitForTimeout(200);
  await shot("t06-dark");
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
});

await step("closing every tab brings back the welcome", async () => {
  while ((await state()).tabs.length) {
    await page.locator(".doc-tab.is-active .doc-tab-close").click();
    const dialog = page.getByRole("alertdialog");
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Descartar" }).click();
    await page.waitForTimeout(200);
  }
  await page.locator(".welcome").waitFor();
  expect((await state()).tabs.length === 0, "tabs left open");
});

console.log(problems.length ? `\nPROBLEMS:\n${problems.join("\n")}` : "\nno problems");
await browser.close();
process.exit(problems.length ? 1 : 0);
