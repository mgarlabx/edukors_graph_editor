// The content editor in WebKit (the engine Tauri uses on macOS), against `npm run dev`:
// the inspector shows a node's content or prompt read-only, ✎ opens it full screen,
// the toolbar formats it, Raw/View, long lines, the agent beside the text, a prompt's
// {{STORAGE: key}}; and the help's shortcuts on Windows.
//   node tests/e2e/content.mjs [outDir]
import { webkit } from "playwright";
import { readFileSync } from "node:fs";
const sample = JSON.parse(readFileSync(new URL("../../samples/world-cats-3-full-course.json", import.meta.url), "utf8"));

const out = process.argv[2] ?? "/tmp";
const url = process.env.EDITOR_URL ?? "http://localhost:1420/";
const browser = await webkit.launch();
const problems = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) problems.push(what);
};

const start = async (platform) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (platform) await page.addInitScript((p) => Object.defineProperty(Navigator.prototype, "platform", { get: () => p }), platform);
  page.on("pageerror", (e) => !/ResizeObserver loop/.test(e.message) && problems.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.getByRole("button", { name: /Aceito os termos|I accept/ }).click();
  await page.getByRole("button", { name: /^(Começar|Start)$/ }).click();
  await page.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), sample);
  await page.locator(".card-node").first().waitFor();
  return page;
};

const page = await start();
const text = (id, lang) =>
  page.evaluate(([id, lang]) => window.__editor.getState().course.nodes.find((n) => n.id === id).content.item.find((e) => e.lang === lang).text, [id, lang]);
// A click on a node or a link works the inspector both ways, so with the panel already out it takes a second click.
const pick = async (id) => {
  const node = page.locator(".card-node", { hasText: id });
  await node.click();
  if (!(await page.locator(".inspector").count())) await node.click();
};
const select = (from, to) =>
  page.evaluate(([from, to]) => {
    const el = document.querySelector(".ce-text");
    el.focus();
    el.setSelectionRange(from, to);
  }, [from, to]);

// The inspector: the content read-only, with ✎; no compare, preview, copy, cut or paste.
await pick("sm1");
const inspector = page.locator(".inspector");
await inspector.locator(".content-peek").waitFor();
check((await inspector.getByText(/comparar idiomas|visualizar/).count()) === 0, "inspector: no compare languages, no preview");
check((await inspector.getByRole("button", { name: /^(Copiar|Recortar|Colar) \(/ }).count()) === 0, "inspector: no copy, cut, paste");
check((await inspector.locator("textarea").count()) === 0, "inspector: the content is not typed in a text box");
await page.screenshot({ path: `${out}/c1-inspector.png` });

// ✎ opens the editor on the language of the tab, Raw first.
await inspector.getByRole("button", { name: "Editar em tela cheia" }).click();
const editor = page.locator(".content-editor");
await editor.waitFor();
const before = await text("sm1", "en");
check((await editor.locator(".ce-text").inputValue()) === before, "editor: Raw shows the text as written");
check((await editor.getByRole("tab", { name: "Raw" }).getAttribute("aria-selected")) === "true", "editor: Raw and View tabs, Raw first");
check((await editor.locator(".ce-tools .icon-btn").count()) === 8, "editor: 7 Markdown commands and the wrap toggle");
await page.screenshot({ path: `${out}/c2-editor-raw.png` });

// The toolbar works on the selection, through the box's own undo.
const word = before.match(/[A-Za-z]{5,}/);
await select(word.index, word.index + word[0].length);
await editor.getByRole("button", { name: "Negrito (⌘B)" }).click();
check((await text("sm1", "en")).includes(`**${word[0]}**`), "toolbar: bold wraps the selected word");
await page.keyboard.press("Meta+z");
check((await text("sm1", "en")) === before, "⌘Z in the box undoes the bold");
await select(word.index, word.index + word[0].length);
await page.keyboard.press("Meta+i");
check((await text("sm1", "en")).includes(`_${word[0]}_`), "⌘I makes it italic");
await select(0, 0);
await editor.getByRole("button", { name: "Lista com marcadores" }).click();
check((await text("sm1", "en")).startsWith("- "), "toolbar: the bulleted list marks the caret's line");

// View renders it; Backspace there deletes nothing on the map behind.
await editor.getByRole("tab", { name: "View" }).click();
await editor.locator(".ce-view em").first().waitFor();
check((await editor.locator(".ce-tools .icon-btn:not(:disabled)").count()) === 0, "View: the toolbar is off");
await page.keyboard.press("Backspace");
check(await page.evaluate(() => window.__editor.getState().course.nodes.some((n) => n.id === "sm1")), "View: Backspace leaves the node alone");
await page.screenshot({ path: `${out}/c3-editor-view.png` });

// Long lines: wrapped, then kept whole, remembered in the preferences.
await editor.getByRole("tab", { name: "Raw" }).click();
await editor.getByRole("button", { name: "Quebrar linhas longas" }).click();
check((await editor.locator(".ce-text").getAttribute("wrap")) === "off", "wrap toggle: long lines kept whole");
check((await page.evaluate(() => import("/src/store/prefs.ts").then((m) => m.usePrefs.getState().editorWrap))) === false, "wrap toggle: kept in the preferences");
await page.screenshot({ path: `${out}/c4-editor-nowrap.png` });
await editor.getByRole("button", { name: "Quebrar linhas longas" }).click();

// The agent, beside the text: ✦ opens it inside the editor, Esc there is the composer's, ✦ closes it.
const agentButton = editor.getByRole("button", { name: /Agente de IA/ });
await agentButton.click();
await editor.locator(".agent-panel").waitFor();
check((await editor.locator(".agent-panel").count()) === 1, "agent: the panel opens beside the text");
check((await page.evaluate(() => document.activeElement?.className)) === "agent-input", "agent: the composer takes the focus");
await page.screenshot({ path: `${out}/c6-editor-agent.png` });
await editor.locator(".agent-input").click();
await page.keyboard.press("Escape");
check((await editor.count()) === 1, "agent: Esc in the composer leaves the editor open");
await agentButton.click();
check((await editor.locator(".agent-panel").count()) === 0, "agent: ✦ closes the panel again");

// Another language, from the selector; Esc closes and the inspector shows the change.
await editor.getByRole("combobox", { name: "Idioma do texto" }).selectOption("pt");
check((await editor.locator(".ce-text").inputValue()) === (await text("sm1", "pt")), "language selector: the Portuguese text");
await page.keyboard.press("Escape");
await editor.waitFor({ state: "detached" });
check((await inspector.locator(".content-peek").innerText()).startsWith("- "), "Esc closes; the inspector shows the text as changed");

// HTML: its own toolbar, and the View in a sandboxed frame.
await pick("sh1");
await inspector.getByRole("button", { name: "Editar em tela cheia" }).click();
check((await editor.getByRole("button", { name: "Parágrafo" }).count()) === 1, "HTML: a paragraph command");
await editor.getByRole("tab", { name: "View" }).click();
await editor.locator("iframe.ce-view").waitFor();
await page.screenshot({ path: `${out}/c5-editor-html-view.png` });
await editor.getByRole("button", { name: "Concluir" }).click();

// A dynamic node's prompt: read-only too; the Markdown bar, the keys, and "{{" completing a key where it is typed.
const promptText = (id) => page.evaluate((id) => window.__editor.getState().course.nodes.find((n) => n.id === id).content.prompt.find((e) => e.lang === "en").text, id);
const refs = (text) => text.split("{{STORAGE:").length - 1;
await pick("dm1");
await inspector.locator(".content-peek.mono").waitFor();
check((await inspector.locator("textarea").count()) === 0, "prompt: read-only in the inspector");
await inspector.getByRole("button", { name: "Editar em tela cheia" }).click();
check((await editor.locator(".ce-kind").innerText()) === "Markdown", "prompt: the Markdown editor");
check((await editor.locator(".ce-tools .icon-btn").count()) === 8, "prompt: the 7 Markdown commands and the wrap toggle");
const keyList = editor.getByRole("combobox", { name: "Inserir {{STORAGE: …}}" });
check((await keyList.count()) === 1, "prompt: the list of keys in the bar");
const promptBefore = await promptText("dm1");
await select(promptBefore.length, promptBefore.length);
await page.keyboard.type(" {{q1");
const menu = editor.locator(".ce-complete");
await menu.waitFor();
await page.screenshot({ path: `${out}/c7-prompt-complete.png` });
await page.keyboard.press("Enter");
check((await promptText("dm1")).startsWith(`${promptBefore} {{STORAGE: q1.`), "prompt: {{ completes a key where it is typed");
await page.keyboard.type(" {{");
await menu.waitFor();
await page.keyboard.press("Escape");
check((await menu.count()) === 0 && (await editor.count()) === 1, "prompt: Esc closes the list first, then the editor");
const typed = refs(await promptText("dm1"));
await keyList.selectOption({ index: 1 });
check(refs(await promptText("dm1")) === typed + 1, "prompt: a key picked in the bar is written at the caret");
await page.keyboard.press("Escape");
await editor.waitFor({ state: "detached" });
await pick("dh1");
await inspector.getByRole("button", { name: "Editar em tela cheia" }).click();
check((await editor.locator(".ce-kind").innerText()) === "Markdown" && (await editor.getByRole("button", { name: "Parágrafo" }).count()) === 0, "AI HTML: its prompt in the Markdown editor too");
await editor.getByRole("button", { name: "Concluir" }).click();

// Help: the full guide's shortcuts on a Mac.
await page.evaluate(() => window.__ui.getState().openHelp("full"));
await page.locator(".help-guide").getByText("⌘B / ⌘I / ⌘K").waitFor();
check((await page.locator(".help-guide").getByText("No Windows, ⌘ e ⌃ correspondem a Ctrl").count()) === 1, "full guide: the Windows note");
await page.close();

// On Windows, the guides and the tooltips say Ctrl, Alt and Shift.
const win = await start("Win32");
await win.evaluate(() => window.__ui.getState().openHelp("quick"));
const quick = await win.locator(".help-quick").innerText();
check(quick.includes("Ctrl+Shift+M") && quick.includes("Ctrl+Alt+0") && !/[⌘⌥⇧]/.test(quick), "quick guide on Windows: Ctrl, Alt, Shift only");
await win.locator(".help-tabs").getByRole("tab", { name: "Guia completo" }).click();
const guide = await win.locator(".help-guide").innerText();
check(guide.includes("Ctrl+Shift+S") && guide.includes("Ctrl+B / Ctrl+I / Ctrl+K") && guide.includes("Shift+Enter"), "full guide on Windows: Ctrl+…");
check(!/[⌘⌥⇧⌃]\S/.test(guide), "full guide on Windows: no Mac shortcut left");
await win.screenshot({ path: `${out}/c6-guide-windows.png` });
await win.keyboard.press("Escape");
await win.locator(".card-node", { hasText: "sm1" }).click();
await win.locator(".inspector").getByRole("button", { name: "Editar em tela cheia" }).click();
check((await win.getByRole("button", { name: "Negrito (Ctrl+B)" }).count()) === 1, "editor on Windows: Bold (Ctrl+B)");

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n- ${problems.join("\n- ")}` : "\nall good");
process.exit(problems.length ? 1 : 0);
