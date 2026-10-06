// The AI agent panel, in WebKit (the engine Tauri uses on macOS), against `npm run dev`.
//
// By default the agent's process is played by a script in the page, so the run
// is the same every time and costs nothing: the panel opens from the toolbar,
// a message goes out with the selection, an edit waits for approval and is
// applied through the editor's own tools, a question and a plan get answered,
// past sessions are listed and reopened.
//
// With --live, the page talks to the real agent/sidecar.mjs (through a small
// bridge here, standing in for the app's Rust side) and so to Claude, with the
// Claude account logged in on this Mac, on Haiku: one short edit of a course.
//   node tests/e2e/agent.mjs [outDir] [--live]
import http from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright";

const args = process.argv.slice(2);
const live = args.includes("--live");
const out = args.find((a) => !a.startsWith("--")) ?? "/tmp";
const url = process.env.EDITOR_URL ?? "http://localhost:1420/";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const course = JSON.parse(readFileSync(join(root, "samples/world-cats-1-mini-course.json"), "utf8"));

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => !/ResizeObserver loop/.test(e.message) && !String(e.stack).includes("web-inspector://") && problems.push(`pageerror: ${e.message}`));
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
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const editor = () =>
  page.evaluate(() => {
    const s = window.__editor.getState();
    return { ids: s.course?.nodes.map((n) => n.id) ?? [], edges: s.course?.edges ?? [], selection: s.selection.nodes, past: s.past.length };
  });
const agent = () => page.evaluate(() => {
  const s = window.__agent.getState();
  return { busy: s.busy, asks: s.asks.length, items: s.items.map((i) => i.kind), mode: s.mode, model: s.model, sessionId: s.sessionId, connection: s.connection };
});

// ------------------------------------------------- the process, scripted ----

/** Plays the agent's process in the page: replies to requests and, for each message, one scripted turn. */
function scriptedTransport() {
  const listeners = [];
  const sent = [];
  const emit = (msg) => setTimeout(() => listeners.forEach((cb) => cb({ ...msg, gen: 1 })), 15);
  const sdk = (msg) => emit({ t: "sdk", sid: "s-new", msg: { session_id: "s-new", uuid: crypto.randomUUID(), parent_tool_use_id: null, ...msg } });
  const models = [
    { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "", supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
    { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "", supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
    { value: "haiku", resolvedModel: "claude-haiku-4-5", displayName: "Haiku 4.5", description: "" },
  ];
  const sessions = [{ sessionId: "s-old", summary: "Revisar o quiz", lastModified: Date.now() - 3600_000, customTitle: "Revisar o quiz", firstPrompt: "Revise o quiz" }];
  let turn = 0;
  const pendingTool = {};
  window.__agentSent = sent;
  const reply = (id, data) => emit({ t: "reply", id, ok: true, data });
  window.__edukorsAgentTransport = {
    async start() {
      emit({ t: "ready", sdk: "test", cwd: "/tmp" });
      return { generation: 1, fresh: true };
    },
    async stop() {},
    async listen(cb) {
      listeners.push(cb);
      return () => undefined;
    },
    async send(msg) {
      sent.push(msg);
      switch (msg.t) {
        case "open":
          return reply(msg.id, { sessionId: msg.resume ?? "s-new", resumed: !!msg.resume, account: { email: "professora@exemplo.org", subscriptionType: "Claude Pro" }, models });
        case "list":
          return reply(msg.id, sessions);
        case "usage":
          return reply(msg.id, {
            at: Date.now(),
            text: "You are currently using your subscription to power your Claude Code usage\n\nCurrent session: 22% used · resets Oct 2 at 1:39pm (America/Sao_Paulo)\nCurrent week (all models): 4% used · resets Oct 8 at 6:59am (America/Sao_Paulo)\n\nWhat's contributing to your limits usage?\nLast 24h · 751 requests · 23 sessions",
          });
        case "history":
          return reply(msg.id, [
            { type: "user", uuid: "h1", message: { role: "user", content: '<editor-context>\nCourse on screen: "x"\n</editor-context>\n\nRevise o quiz' } },
            { type: "assistant", uuid: "h2", message: { id: "m0", content: [{ type: "text", text: "O quiz está **bom**." }] } },
          ]);
        case "send": {
          reply(msg.id, { sessionId: "s-new" });
          turn += 1;
          if (turn === 1) {
            // Streams a sentence, asks to edit, and waits for the answer.
            sdk({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } });
            sdk({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } });
            sdk({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Vou adicionar uma pergunta de sim ou não depois de **sm5**." } } });
            sdk({ type: "stream_event", event: { type: "content_block_stop", index: 0 } });
            sdk({ type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Vou adicionar uma pergunta de sim ou não depois de **sm5**." }] } });
            const input = {
              summary: "Adiciona uma pergunta sim/não depois de sm5",
              operations: [
                { op: "add_node", node: { id: "b1", type: "bool", title: [{ lang: "en", text: "More?" }], content: { question: [{ lang: "en", text: "Do you want to know more?" }] } }, near: "sm5" },
                { op: "set_edges", from: "sm5", edges: [{ to: "b1" }] },
              ],
            };
            pendingTool.input = input;
            sdk({ type: "assistant", message: { id: "m1", content: [{ type: "tool_use", id: "tu1", name: "mcp__edukors__edit_course", input }] } });
            emit({ t: "ask", id: "ask1", sid: "s-new", kind: "permission", tool: "mcp__edukors__edit_course", input, toolUseId: "tu1", reason: null });
          } else if (turn === 2) {
            emit({
              t: "ask",
              id: "ask2",
              sid: "s-new",
              kind: "question",
              tool: "AskUserQuestion",
              toolUseId: "tu2",
              reason: null,
              input: { questions: [{ question: "Para qual ano?", header: "Ano", multiSelect: false, options: [{ label: "6º ano", description: "11–12 anos" }, { label: "9º ano", description: "14–15 anos" }] }] },
            });
          } else if (turn === 3) {
            emit({ t: "ask", id: "ask3", sid: "s-new", kind: "plan", tool: "ExitPlanMode", toolUseId: "tu3", reason: null, input: { plan: "1. Ler o curso\n2. Adicionar um quiz no fim" } });
          } else if (turn === 4) {
            // A plan written as the reply, with no ExitPlanMode after it.
            sdk({ type: "assistant", message: { id: "m4", content: [{ type: "text", text: "## Plano\n1. Adicionar **q1** depois de sm5." }] } });
            sdk({ type: "result", subtype: "success", is_error: false, result: "" });
          } else {
            sdk({ type: "assistant", message: { id: `m${turn}`, content: [{ type: "text", text: "Feito." }] } });
            sdk({ type: "result", subtype: "success", is_error: false, result: "" });
          }
          return;
        }
        case "answer":
          if (msg.id === "ask1") {
            if (msg.behavior !== "allow") return;
            // The approved edit runs in the editor, as the real process asks it to.
            emit({ t: "tool", id: "call1", name: "edit_course", args: pendingTool.input });
          } else {
            sdk({ type: "assistant", message: { id: `m${turn}x`, content: [{ type: "text", text: "Entendido." }] } });
            sdk({ type: "result", subtype: "success", is_error: false, result: "" });
          }
          return;
        case "tool_reply":
          window.__agentToolReply = msg;
          sdk({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: [{ type: "text", text: msg.text }], is_error: msg.isError }] } });
          sdk({ type: "assistant", message: { id: "m2", content: [{ type: "text", text: "Pronto: **b1** pergunta se o estudante quer saber mais." }] } });
          sdk({ type: "result", subtype: "success", is_error: false, result: "" });
          return;
        default:
          if (msg.id) reply(msg.id, null);
      }
    },
  };
}

// ---------------------------------------------- the process, for real ----

/** Spawns agent/sidecar.mjs and relays it over HTTP, as src-tauri/src/agent.rs does over Tauri events. */
function startBridge() {
  let child = null;
  let generation = 0;
  const clients = new Set();
  const emit = (obj) => clients.forEach((res) => res.write(`data: ${JSON.stringify(obj)}\n\n`));
  const cwd = mkdtempSync(join(tmpdir(), "edukors-agent-e2e-"));
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.end();
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(": open\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/start") {
        if (child && child.exitCode === null) return res.end(JSON.stringify({ generation, fresh: false }));
        const gen = ++generation;
        child = spawn(process.execPath, [join(root, "agent", "sidecar.mjs")], { env: { ...process.env, EDUKORS_AGENT_CWD: cwd }, stdio: ["pipe", "pipe", "pipe"] });
        createInterface({ input: child.stdout }).on("line", (line) => {
          try {
            emit({ ...JSON.parse(line), gen });
          } catch {
            /* not a protocol line */
          }
        });
        child.stderr.on("data", () => undefined);
        child.on("exit", () => emit({ t: "exit", gen, stderr: "" }));
        return res.end(JSON.stringify({ generation: gen, fresh: true }));
      }
      if (req.url === "/send") {
        child?.stdin.write(body + "\n");
        return res.end("{}");
      }
      if (req.url === "/stop") {
        child?.stdin.end();
        return res.end("{}");
      }
      res.statusCode = 404;
      res.end();
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        close: async () => {
          child?.stdin.end();
          if (child && child.exitCode === null) await new Promise((r) => child.on("exit", r));
          server.closeAllConnections();
          server.close();
          // The conversations this run left in Claude Code's own folder go with it.
          rmSync(join(homedir(), ".claude", "projects", realpathSync(cwd).replace(/[^a-zA-Z0-9]/g, "-")), { recursive: true, force: true });
          rmSync(cwd, { recursive: true, force: true });
        },
      }),
    ),
  );
}

function bridgeTransport(base) {
  window.__edukorsAgentTransport = {
    start: () => fetch(`${base}/start`, { method: "POST" }).then((r) => r.json()),
    send: (msg) => fetch(`${base}/send`, { method: "POST", body: JSON.stringify(msg) }).then(() => undefined),
    stop: () => fetch(`${base}/stop`, { method: "POST" }).then(() => undefined),
    listen: (cb) =>
      new Promise((resolve) => {
        const events = new EventSource(`${base}/events`);
        events.onmessage = (e) => cb(JSON.parse(e.data));
        events.onopen = () => resolve(() => events.close());
      }),
  };
}

const bridge = live ? await startBridge() : null;
if (bridge) await page.addInitScript(bridgeTransport, bridge.base);
else await page.addInitScript(scriptedTransport);

await page.goto(url);
// The terms of use come first, on a fresh profile.
await page.getByRole("button", { name: "Aceito os termos" }).click();
// then the opening, with the version
await page.getByRole("button", { name: "Começar" }).click();

await step("open a sample course", async () => {
  // The welcome screen no longer lists the samples: the course is opened as a file would be.
  await page.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), course);
  await page.locator(".card-node").first().waitFor();
  await page.waitForTimeout(800);
});

await step("the AI button sits at the right end of the toolbar and opens the agent beside the inspector", async () => {
  const button = page.locator(".toolbar .tool-agent");
  const box = await button.boundingBox();
  const bar = await page.locator(".toolbar").boundingBox();
  expect(box && bar && bar.x + bar.width - (box.x + box.width) < 24, "the AI button is not at the right end");
  // the inspector starts closed on a file just opened; the sidebar button brings it out
  if (!(await page.locator(".inspector").count())) await page.locator(".toolbar .tool-group-end .icon-btn").first().click();
  await page.locator(".inspector").waitFor();
  await button.click();
  await page.locator(".agent-panel").waitFor();
  expect(await page.locator(".inspector").count() === 1, "the inspector should stay beside the agent");
  // the sidebar button closes the inspector only, and brings it back
  await page.locator(".toolbar .tool-group-end .icon-btn").first().click();
  expect(await page.locator(".inspector").count() === 0, "the sidebar button did not close the inspector");
  expect(await page.locator(".agent-panel").count() === 1, "the sidebar button closed the agent");
  await page.locator(".toolbar .tool-group-end .icon-btn").first().click();
  await page.locator(".inspector").waitFor();
  await page.locator(".agent-hello, .agent-account").first().waitFor({ timeout: 60_000 });
  expect((await agent()).connection === "ready", "not connected");
  // The start of a conversation shows the usage windows under the account.
  await page.locator(".agent-usage.is-compact .agent-usage-line").first().waitFor({ timeout: 60_000 });
  await shot("a01-panel-open");
});

if (!live) {
  await step("a message goes out with the course and the selection", async () => {
    await page.evaluate(() => window.__editor.getState().select({ nodes: ["sm5"], edge: null }));
    await page.locator(".agent-selection").waitFor();
    await page.locator(".agent-input").fill("Adicione uma pergunta sim/não depois deste passo");
    await page.keyboard.press("Enter");
    await page.locator(".agent-ask").waitFor();
    const sent = await page.evaluate(() => window.__agentSent.find((m) => m.t === "send"));
    expect(sent.text.includes("<editor-context>") && sent.text.includes('Selected: sm5 (static-md)'), "the context did not go along");
    expect(sent.text.endsWith("Adicione uma pergunta sim/não depois deste passo"), "the message is not at the end");
    expect((await page.locator(".agent-user").innerText()).includes("sm5 ·"), "the bubble does not show the selection");
    await shot("a02-permission");
  });

  await step("an approved edit is applied by the editor as one undo step", async () => {
    expect((await page.locator(".agent-ask .agent-ops li").count()) === 2, "the card should list the two operations");
    await page.getByRole("button", { name: "Permitir", exact: true }).click();
    await page.getByText("Pronto:").waitFor();
    const e = await editor();
    expect(e.ids.includes("b1"), "b1 was not added");
    expect(e.edges.some((x) => x.from === "sm5" && x.to === "b1"), "no edge sm5 → b1");
    expect(e.past === 1, `expected one undo step, got ${e.past}`);
    const reply = await page.evaluate(() => window.__agentToolReply);
    expect(reply && !reply.isError && reply.text.includes("applied 2 operations"), "the tool reply is wrong");
    expect(!(await agent()).busy, "still busy after the result");
    await page.locator(".agent-tool .agent-tool-head").first().click();
    await shot("a03-edited");
  });

  await step("a question from the agent is answered from the panel", async () => {
    await page.locator(".agent-input").fill("Crie um curso de frações");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /6º ano/ }).click();
    await shot("a04-question");
    await page.getByRole("button", { name: "Responder" }).click();
    const answer = await page.evaluate(() => window.__agentSent.find((m) => m.t === "answer" && m.id === "ask2"));
    expect(answer.behavior === "allow" && answer.updatedInput.answers["Para qual ano?"] === "6º ano", "the answer is wrong");
  });

  await step("the model menu shows the account's usage windows as Claude Code words them", async () => {
    await page.locator(".agent-model > .agent-chip").click();
    const lines = page.locator(".agent-menu .agent-usage-line");
    await lines.first().waitFor();
    expect((await lines.count()) === 2, "expected the session and week windows");
    expect((await lines.first().innerText()).startsWith("Current session: 22% used"), "the line was changed");
    const width = await page.locator(".agent-menu .agent-usage-bar > span").first().evaluate((el) => el.style.width);
    expect(width === "22%", `bar at ${width}`);
    expect((await page.locator(".agent-menu .agent-usage-more pre").textContent()).includes("751 requests"), "the details are missing");
    const before = await page.evaluate(() => window.__agentSent.filter((m) => m.t === "usage").length);
    await page.getByRole("button", { name: "Atualizar o uso" }).click();
    await page.waitForFunction((n) => window.__agentSent.filter((m) => m.t === "usage").length > n, before);
    await shot("a04b-usage");
    await page.keyboard.press("Escape");
    expect((await page.locator(".agent-usage.is-compact").count()) === 0, "no compact usage once the conversation has started");
  });

  await step("the mode and the model change from the composer", async () => {
    await page.locator(".agent-mode-ask > .agent-chip").click();
    await page.getByRole("menuitemradio", { name: /Planejar/ }).click();
    await page.locator(".agent-model > .agent-chip").click();
    await page.getByRole("menuitemradio", { name: /Haiku/ }).click();
    await page.keyboard.press("Escape");
    const s = await agent();
    expect(s.mode === "plan" && s.model === "haiku", `mode ${s.mode}, model ${s.model}`);
    const sets = await page.evaluate(() => window.__agentSent.filter((m) => m.t === "set"));
    expect(sets.some((m) => m.mode === "plan") && sets.some((m) => m.model === "haiku"), "the process was not told");
  });

  await step("a plan is approved with the mode to go on in", async () => {
    await page.locator(".agent-input").fill("Planeje um quiz no fim");
    await page.keyboard.press("Enter");
    await page.locator(".agent-plan").waitFor();
    await shot("a05-plan");
    await page.getByRole("button", { name: "Aprovar e pedir antes de editar" }).click();
    const answer = await page.evaluate(() => window.__agentSent.find((m) => m.t === "answer" && m.id === "ask3"));
    expect(answer.behavior === "allow" && answer.mode === "ask", "the plan answer is wrong");
    expect((await agent()).mode === "ask", "the mode did not follow the approval");
  });

  await step("a plan given as a reply can be approved too", async () => {
    await page.locator(".agent-mode-ask > .agent-chip").click();
    await page.getByRole("menuitemradio", { name: /Planejar/ }).click();
    await page.locator(".agent-input").fill("Planeje outro quiz");
    await page.keyboard.press("Enter");
    await page.locator(".agent-plan-bar").waitFor();
    await shot("a05b-plan-bar");
    await page.locator(".agent-plan-bar").getByRole("button", { name: "Aprovar e editar automaticamente" }).click();
    await page.getByText("Feito.").waitFor();
    const s = await agent();
    expect(s.mode === "auto", `mode ${s.mode}`);
    const sends = await page.evaluate(() => window.__agentSent.filter((m) => m.t === "send").map((m) => m.text));
    expect(sends.at(-1).endsWith("Plano aprovado: pode executar."), "the approval was not sent");
    expect(!(await page.locator(".agent-plan-bar").count()), "the bar should go once the mode is not plan");
  });

  await step("⇧⌘A closes and opens the panel, and the inspector stays", async () => {
    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 40 } });
    await page.keyboard.press("Meta+Shift+A");
    await page.locator(".agent-panel").waitFor({ state: "detached" });
    expect((await page.locator(".inspector").count()) === 1, "the inspector went with the agent");
    await page.keyboard.press("Meta+Shift+A");
    await page.locator(".agent-panel").waitFor();
    expect((await page.locator(".inspector").count()) === 1, "the inspector went when the agent came back");
    expect((await page.locator(".agent-user").count()) > 0, "the conversation did not survive closing the panel");
  });

  await step("past sessions are listed and reopened with their history", async () => {
    await page.locator(".agent-head .agent-title").click();
    await page.getByText("Revisar o quiz").waitFor();
    await shot("a06-sessions");
    await page.getByText("Revisar o quiz").click();
    await page.getByText("O quiz está").waitFor();
    const s = await agent();
    expect(s.sessionId === "s-old" && s.items.join() === "user,text", `reopened ${s.sessionId}: ${s.items}`);
    expect((await page.locator(".agent-title-text").innerText()) === "Revisar o quiz", "the title did not follow");
  });

  await step("a new session starts empty", async () => {
    await page.getByRole("button", { name: "Nova sessão" }).click();
    await page.locator(".agent-hello").waitFor();
    expect((await agent()).items.length === 0, "not empty");
  });

  await step("in a plain browser the panel says the agent needs the app", async () => {
    const plain = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await plain.goto(url);
    await plain.getByRole("button", { name: "Aceito os termos" }).click();
    // then the opening, with the version
    await plain.getByRole("button", { name: "Começar" }).click();
    await plain.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), course);
    await plain.locator(".toolbar .tool-agent").click();
    await plain.getByText("O agente funciona dentro do app").waitFor();
    expect((await plain.getByRole("button", { name: "Tentar de novo" }).count()) === 0, "no retry without the app");
    await plain.close();
  });

  await step("a process that cannot load the SDK says so, and the message stays", async () => {
    const broken = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await broken.addInitScript(() => {
      const listeners = [];
      window.__edukorsAgentTransport = {
        async start() {
          setTimeout(() => listeners.forEach((cb) => cb({ t: "fatal", code: "sdk-missing", message: "Cannot find package '@anthropic-ai/claude-agent-sdk'", gen: 1 })), 10);
          setTimeout(() => listeners.forEach((cb) => cb({ t: "exit", stderr: "", gen: 1 })), 60);
          return { generation: 1, fresh: true };
        },
        async stop() {},
        async listen(cb) {
          listeners.push(cb);
          return () => undefined;
        },
        async send() {},
      };
    });
    await broken.goto(url);
    await broken.getByRole("button", { name: "Aceito os termos" }).click();
    // then the opening, with the version
    await broken.getByRole("button", { name: "Começar" }).click();
    await broken.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), course);
    await broken.locator(".toolbar .tool-agent").click();
    await broken.getByText("O Claude Agent SDK não está instalado").waitFor();
    await broken.waitForTimeout(600);
    expect((await broken.getByText("O Claude Agent SDK não está instalado").count()) === 1, "the error did not stay");
    expect((await broken.evaluate(() => window.__agent.getState().connection)) === "error", "not in error");
    await broken.close();
  });
} else {
  await step("Claude edits the course through the editor, after approval", async () => {
    await page.locator(".agent-model > .agent-chip").click();
    await page.getByRole("menuitemradio", { name: /Haiku/ }).click();
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__editor.getState().select({ nodes: ["sm5"], edge: null }));
    await page.locator(".agent-input").fill("Adicione depois do passo selecionado um passo do tipo sim/não (bool) que pergunta, em inglês, se o estudante quer saber mais, com uma seta do passo selecionado para ele. Faça só isso, numa única edição.");
    await page.keyboard.press("Enter");
    await page.locator(".agent-ask").waitFor({ timeout: 180_000 });
    await shot("a02-live-permission");
    // Each edit waits for approval; the agent may make a second one to fix what validation found.
    const deadline = Date.now() + 300_000;
    let approved = 0;
    while (Date.now() < deadline) {
      const s = await agent();
      if (s.asks) {
        await page.getByRole("button", { name: "Permitir", exact: true }).first().click();
        approved += 1;
      } else if (!s.busy) break;
      await page.waitForTimeout(500);
    }
    expect(approved >= 1, "nothing was approved");
    expect(!(await agent()).busy, "the turn did not end");
    const e = await editor();
    const added = e.ids.filter((id) => /^b\d+$/.test(id));
    expect(added.length === 1, `expected one bool step, got ${e.ids}`);
    expect(e.edges.some((x) => x.from === "sm5" && x.to === added[0]), "no edge from sm5");
    expect(e.past === approved, `expected ${approved} undo steps, got ${e.past}`);
    await shot("a03-live-edited");
  });

  await step("the conversation is in the session list", async () => {
    await page.locator(".agent-head .agent-title").click();
    await page.locator(".agent-session").first().waitFor({ timeout: 30_000 });
    await shot("a04-live-sessions");
  });
}

await browser.close();
await bridge?.close();
if (problems.length) {
  console.log("\nProblems:\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log("\nall good");
