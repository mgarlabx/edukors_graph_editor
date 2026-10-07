// The preview, end to end, with OpenRouter answered by this script (plan 5.5,
// phase 4 criterion). Walks world-cats-2-short in WebKit: a wrong quiz sends the
// student to the AI-written reinforcement, the essay is judged by the decisions
// endpoint, and the feedback is written from that judgement. Then it checks the
// requests the editor sent, and holds the judgement and the branch it took to
// the player's own src/ai.php and src/course.php.
//
//   npm run dev   (another terminal)
//   node tests/e2e/preview.mjs [outDir]
import { webkit } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const GRAPH = process.env.EDUKORS_GRAPH ?? join(process.env.HOME, "Library/CloudStorage/Dropbox/EDUKORS/edukors_graph");
const out = process.argv[2] ?? "/tmp";
const url = process.env.EDITOR_URL ?? "http://localhost:1420/";
const course = JSON.parse(readFileSync(join(here, "../../samples/world-cats-2-short-course.json"), "utf8"));
const php = (input) => JSON.parse(execFileSync("php", [join(here, "../php/harness.php"), join(GRAPH, "player/src")], { input: JSON.stringify(input), encoding: "utf8" }));

// What the decisions model "answers" for s1: every question, a spread over three levels.
const SPREADS = { habitat: [0.1, 0.3, 0.6], diet: [0, 0.2, 0.8], trait: [0.05, 0.9, 0.05], needs: [0.2, 0.5, 0.3], tone: [0, 0, 1] };
const answers = Object.fromEntries(
  Object.entries(SPREADS).map(([k, p]) => [k, { score: p[1] + 2 * p[2], confidence: 0.86, probabilities: p }]),
);

const sent = { chat: [], decisions: [] };
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
// undefinedCall is the error this script throws on purpose, in an HTML step, for the Console tab.
page.on("pageerror", (e) => !/ResizeObserver loop|undefinedCall/.test(e.message) && !String(e.stack).includes("web-inspector://") && problems.push(e.message));
await page.route("https://openrouter.ai/**", async (route) => {
  const req = route.request();
  const body = JSON.parse(req.postData() ?? "{}");
  if (req.url().includes("/decisions")) {
    sent.decisions.push(body);
    return route.fulfill({ json: { model: "typesafe/jev-1.13-20260917", answers, usage: { input_tokens: 900, output_tokens: 0, cost: 0.0004 } } });
  }
  sent.chat.push(body);
  const user = body.messages?.[1]?.content ?? "";
  const text = user.includes("THE JUDGEMENT ALREADY MADE") ? "## Your feedback\n\nGood work on diet and tone." : "## Reinforcement\n\nCats are carnivores.";
  return route.fulfill({ json: { model: body.model, choices: [{ message: { content: text } }], usage: { prompt_tokens: 500, completion_tokens: 40, cost: 0.0002 } } });
});

await page.addInitScript(() => localStorage.setItem("edukors-editor.dev-openrouter-key", "sk-or-test"));
await page.goto(url);
// The terms of use come first, on a fresh profile.
await page.getByRole("button", { name: "Aceito os termos" }).click();
// then the opening, with the version
await page.getByRole("button", { name: "Começar" }).click();
await page.locator(".toolbar").waitFor();
// The welcome screen no longer lists the samples: the course is opened as a file would be.
await page.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), course);
await page.locator(".card-node").first().waitFor();
await page.getByRole("tab", { name: "Preview" }).click();
const player = page.frameLocator(".preview-frame");
// Toasts the player put on the page, seen however briefly.
const watchToasts = () =>
  player.locator("body").evaluate(() => {
    window.__toasts = 0;
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.classList?.contains("edukors-player-toast") && window.__toasts++))).observe(document.body, { childList: true });
  });
const next = async () => {
  await player.locator('[data-action="complete"]:not([disabled])').click();
  await page.waitForTimeout(350);
};
await player.locator('[data-action="start"]').click();
await watchToasts();
await next(); // sm1
await next(); // sh1
await next(); // sm3
// sm3 ends the first section: the second opens on a screen of its own before q1
await player.locator(".edukors-player-opening").waitFor();
const opening = await player.locator(".edukors-player-opening").innerText();
await player.locator('[data-action="open-section"]').click();
await page.waitForTimeout(350);
// q1: the wrong option everywhere, so q1.percent < 70 and the student goes to dm1
const questions = course.nodes.find((n) => n.id === "q1").content.items;
for (const [qi, q] of questions.entries()) {
  const wrong = q.options.findIndex((o) => !o.correct);
  await player.locator(`[data-action="quiz-option"][data-question="${qi}"][data-option="${wrong}"]`).click();
}
await next(); // q1 -> dm1
await player.locator(".edukors-player-step-prose").first().waitFor();
await next(); // dm1 -> f1
const essay = Array.from({ length: 170 }, (_, i) => (i % 9 ? "cat" : "lion")).join(" ");
await player.locator("textarea").fill(essay);
await next(); // f1 -> s1, judged on its own, then -> dm2
await player.locator(".edukors-player-step-prose", { hasText: "Your feedback" }).waitFor({ timeout: 15000 });
await page.screenshot({ path: `${out}/20-preview-judged.png` });
await page.getByRole("tab", { name: "Caminho" }).click();
await page.screenshot({ path: `${out}/21-preview-path.png` });

const steps = await page.locator(".path-list li").allInnerTexts();
await page.getByRole("tab", { name: "Chamadas" }).click();
const rows = await page.locator(".table tbody tr").allInnerTexts();

// The "step completed" toast never stays on the page.
const toastsLeft = await player.locator(".edukors-player-toast").count();
const toastsSeen = await player.locator("body").evaluate(() => window.__toasts);

// The console: what the player, and an HTML step's frame inside it, write there reaches the Console tab.
await page.getByRole("tab", { name: /^Console/ }).click();
await player.locator("body").evaluate(() => {
  console.error("e2e: from the player");
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts");
  f.title = "e2e step";
  f.srcdoc = "<!doctype html><html><head></head><body><script>console.warn('e2e: from a step'); undefinedCall();</script></body></html>";
  document.body.append(f);
});
await page.locator(".console-line.level-error", { hasText: "e2e: from the player" }).waitFor({ timeout: 5000 }).catch(() => undefined);
await page.locator(".console-line.level-warn", { hasText: "e2e: from a step" }).waitFor({ timeout: 5000 }).catch(() => undefined);
await page.waitForTimeout(300);
const consoleLines = await page.locator(".console-line").allInnerTexts();
await page.screenshot({ path: `${out}/22-preview-console.png` });

// A link to the web is handed to the editor, which opens it in the computer's browser (here, a popup).
const popup = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
await player.locator("body").evaluate(() => {
  const a = document.createElement("a");
  a.href = "https://example.com/e2e";
  a.target = "_blank";
  a.textContent = "e2e link";
  a.id = "e2e-link";
  document.body.append(a);
});
await page.route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));
await player.locator("#e2e-link").click();
const opened = await popup;
const openedUrl = opened ? opened.url() : "";
await browser.close();

const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) problems.push(what);
};

// The path the player took, as the editor recorded it.
const hops = steps.map((s) => s.split("\n")[0].replace(/\s+/g, " "));
console.log(hops.join("\n"));
check(opening.includes("Check and delivery") && opening.includes("The cats"), "between sections, the next one opens naming it, and the one done");
check(hops.some((h) => /^q1 → dm1/.test(h)), "a wrong quiz goes to the reinforcement (q1 → dm1)");
check(hops.some((h) => /^s1 → dm2/.test(h)), "a judgement that happened goes to the feedback (s1 → dm2)");
check(rows.length === 3, `three calls logged (generate, judge, generate): ${rows.length}`);

// The requests, as api/ai.php would have made them.
check(sent.decisions.length === 1, "one call to the decisions endpoint");
const decision = sent.decisions[0];
check(decision?.model === "typesafe/jev-1.13" && decision?.provider?.allow_fallbacks === false, "decisions body: exact slug, pinned route");
check(Object.keys(decision?.questions ?? {}).join() === "habitat,diet,trait,needs,tone", "decisions body: one question per item");
check(String(decision?.state?.answer ?? decision?.state?.text ?? JSON.stringify(decision?.state)).includes("lion"), "decisions body: state carries the student's text");
check(sent.chat.length === 2, "two chat calls (dm1, dm2)");
check(sent.chat.every((b) => b.messages[0].role === "system" && b.messages[0].content.endsWith('Answer in that language.')), "chat: system prompt with the language line");
check(sent.chat[1]?.messages[1].content.includes("--- THE JUDGEMENT ALREADY MADE ---"), "feedback prompt carries the judgement (from)");

// The judgement and the branch, held to the server.
const s1 = course.nodes.find((n) => n.id === "s1");
const server = php({ op: "judge", nodeId: "s1", type: "score", content: s1.content, answers, floor: 0.7 });
check(server.judged === true, "ai.php accepts the same answer");
const nextOnServer = php({ op: "next", course, from: "s1", vars: server.vars });
check(nextOnServer === "dm2", `course.php takes the same edge out of s1 (${nextOnServer})`);
const block = php({ op: "block", judge: s1, vars: { ...server.vars, "f1.text": essay } });
check(sent.chat[1]?.messages[1].content.endsWith(block), "the feedback prompt ends with ai.php's judgement block, to the character");

check(toastsSeen > 0 && toastsLeft === 0, `the step-completed toast the player puts up (${toastsSeen}) is taken off the page`);
check(consoleLines.some((l) => l.includes("e2e: from the player")), "the player's console.error reaches the Console tab");
check(consoleLines.some((l) => l.includes("e2e: from a step") && l.includes("e2e step")), "an HTML step's console.warn reaches the Console tab, named after the step");
// WebKit hides the message of an error thrown in a sandboxed frame; the line says so.
check(consoleLines.some((l) => l.includes("e2e step") && (l.includes("undefinedCall") || /try\/catch/.test(l))), "an uncaught error in an HTML step reaches the Console tab");
check(openedUrl.startsWith("https://example.com/e2e"), `a link to the web opens outside the preview (${openedUrl || "nothing opened"})`);

console.log(problems.length ? `\nPROBLEMS:\n${problems.join("\n")}` : "\nall good");
process.exit(problems.length ? 1 : 0);
