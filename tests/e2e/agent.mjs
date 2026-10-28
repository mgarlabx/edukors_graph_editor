// The AI agent panel, in WebKit (the engine Tauri uses on macOS), against `npm run dev`.
//
// The page talks to the real EDUKORS AI library host (@edukors/ai-cli), the
// program the app starts, through a small bridge here that stands in for the
// app's Rust side (src-tauri/src/agent.rs). By default the host runs the
// library's fake provider, so the run is the same every time and costs
// nothing: no account, then one added and signed in; a message with the
// selection; an edit approved and applied as one undo step; a question, a
// plan, a stop; a user's MCP server called after approval; the conversations
// listed and reopened.
//
// With --live the host runs the real providers on the accounts of the data
// directory given (one short edit of a course, after approval):
//   node tests/e2e/agent.mjs [outDir] [--live --data-dir=<dir> --account=<label>]
import http from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright";

const args = process.argv.slice(2);
const live = args.includes("--live");
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = args.find((a) => !a.startsWith("--")) ?? "/tmp";
const url = process.env.EDITOR_URL ?? "http://localhost:1420/";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const course = JSON.parse(readFileSync(join(root, "samples/world-cats-1-mini-course.json"), "utf8"));
const LIBRARY = realpathSync(join(root, "node_modules", "@edukors", "ai-cli"));
const HOST = join(LIBRARY, "dist", "host", "main.js");
const FAKE_MCP = join(LIBRARY, "fixtures", "fake-mcp-server.mjs");
const dataDir = live ? option("data-dir") : mkdtempSync(join(tmpdir(), "graph-e2e-agent-"));
if (live && !dataDir) throw new Error("--live needs --data-dir=<the accounts' data directory>");

// ------------------------------------------------- the app's side, here ----

/** What src-tauri/src/agent.rs does: one host process, its lines out to the page, the page's lines in. */
function startBridge() {
  let child = null;
  let generation = 0;
  const clients = new Set();
  const broadcast = (msg) => {
    for (const res of clients) res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.end();
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      // Sent at once, so the page knows the stream is open before the host says anything.
      res.flushHeaders();
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
        child = spawn(process.execPath, [HOST, "--app-id", "graph-e2e", "--data-dir", dataDir, ...(live ? [] : ["--fake"])], { stdio: ["pipe", "pipe", "pipe"] });
        createInterface({ input: child.stdout }).on("line", (line) => {
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            msg = { t: "log", text: line };
          }
          broadcast({ ...msg, gen });
        });
        child.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
        child.on("exit", () => broadcast({ t: "exit", gen, stderr: "" }));
        return res.end(JSON.stringify({ generation: gen, fresh: true }));
      }
      if (req.url === "/send") {
        child?.stdin.write(body + "\n");
        return res.end("{}");
      }
      if (req.url === "/stop") {
        child?.kill();
        child = null;
        return res.end("{}");
      }
      res.writeHead(404).end();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => (child?.kill(), server.close()) })));
}

/** The page's transport (src/agent/client.ts), over the bridge. */
function bridgeTransport(base) {
  window.__edukorsAgentTransport = {
    start: async () => (await fetch(`${base}/start`, { method: "POST" })).json(),
    send: async (msg) => void (await fetch(`${base}/send`, { method: "POST", body: JSON.stringify(msg) })),
    stop: async () => void (await fetch(`${base}/stop`, { method: "POST" })),
    listen: async (cb) => {
      const source = new EventSource(`${base}/events`);
      await new Promise((resolve) => (source.onopen = resolve));
      source.onmessage = (e) => cb(JSON.parse(e.data));
      return () => source.close();
    },
  };
}

// ------------------------------------------------------------ the run ----

const bridge = await startBridge();
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => !/ResizeObserver loop/.test(e.message) && problems.push(`pageerror: ${e.message}`));
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
const agent = () =>
  page.evaluate(() => {
    const s = window.__agent.getState();
    return { busy: s.busy, asks: s.asks.length, items: s.items.map((i) => i.kind), connection: s.connection, accountId: s.accountId, sessionId: s.sessionId };
  });
const editor = () =>
  page.evaluate(() => {
    const s = window.__editor.getState();
    return { ids: s.course?.nodes.map((n) => n.id) ?? [], past: s.past.length };
  });
const idle = () => page.waitForFunction(() => !window.__agent.getState().busy, null, { timeout: 120_000 });
const say = async (text) => {
  await page.locator(".agent-input").fill(text);
  await page.keyboard.press("Enter");
};
const lastAnswer = () =>
  page.evaluate(() => {
    const items = window.__agent.getState().items;
    const at = items.map((i) => i.kind).lastIndexOf("user");
    return items.slice(at + 1).filter((i) => i.kind === "text").map((i) => i.text).join("");
  });

await page.addInitScript(bridgeTransport, bridge.base);
await page.goto(url);
await page.getByRole("button", { name: "Aceito os termos" }).click();
await page.getByRole("button", { name: "Começar" }).click();

await step("open a sample course", async () => {
  await page.evaluate(async (c) => (await import("/src/store/docs.ts")).openDoc(c, { path: null, saved: true }), course);
  await page.locator(".card-node").first().waitFor();
});

await step("the AI button opens the agent, which asks for an account when there is none", async () => {
  await page.locator(".toolbar .tool-agent").click();
  await page.locator(".agent-panel").waitFor();
  if (live) return;
  await page.getByText("Nenhuma conta de IA conectada").waitFor({ timeout: 30_000 });
  expect((await agent()).connection === "ready", "not connected to the host");
  await shot("b01-no-account");
});

await step("the preferences show Accounts first and, under Advanced, instructions, MCP servers and skills", async () => {
  if (live) return;
  await page.getByRole("button", { name: "Abrir contas" }).click();
  await page.getByRole("button", { name: "Agente de IA (CLI)" }).click();
  await page.getByText("Contas de IA", { exact: true }).waitFor();
  await page.getByText("Nenhuma conta ainda. Adicione uma para usar o agente.").waitFor();
  const order = await page.evaluate(() => [...document.querySelectorAll(".prefs-card label, .prefs-card .field-label, h3.prefs-group")].map((e) => e.textContent?.trim()).filter(Boolean));
  const at = (text) => order.findIndex((t) => t.startsWith(text));
  expect(at("Contas de IA") < at("Avançado") && at("Avançado") < at("Instruções para o agente") && at("Instruções para o agente") < at("Servidores MCP") && at("Servidores MCP") < at("Skills"), `wrong order: ${order.join(" | ")}`);
  // An account of the library's fake provider, which the Add form does not offer: added as the form would.
  await page.evaluate(async () => {
    const a = window.__agent.getState();
    const id = await a.addAccount("fake", "Escola");
    await a.connectAccount(id);
  });
  await page.locator(".agent-account", { hasText: "Escola" }).getByText("Em uso").waitFor({ timeout: 30_000 });
  await page.locator(".agent-account", { hasText: "Escola" }).getByText("Conectada").waitFor();
  await shot("b02-accounts");
  await page.getByRole("button", { name: "Cancelar" }).click();
});

await step("the panel greets on the account, and a message goes out with the course and the selection", async () => {
  await page.locator(".agent-hello").waitFor({ timeout: 60_000 });
  if (!live) expect((await page.locator(".agent-account").first().innerText()).includes("Escola"), "the account line does not name the account");
  await page.evaluate(() => window.__editor.getState().select({ nodes: ["sm2"], edge: null }));
  await page.locator(".agent-selection").waitFor();
  if (live) return;
  await say("Olá");
  await idle();
  expect((await lastAnswer()).startsWith("Echo: Olá"), `unexpected answer: ${await lastAnswer()}`);
  expect((await page.locator(".agent-user").last().innerText()).includes("sm2"), "the bubble does not show the selection");
});

await step("an edit waits for approval, and is applied by the editor as one undo step", async () => {
  const before = (await editor()).past;
  if (live) {
    await say("Mude o título do passo sm2 para 'Gatos pequenos' com edit_course. Não faça mais nada.");
  } else {
    await say('tool edit_course {"summary":"Renomeia sm2","operations":[{"op":"update_node","id":"sm2","title":[{"lang":"en","text":"Small cats"}]}]}');
  }
  await page.getByRole("button", { name: "Permitir", exact: true }).waitFor({ timeout: 180_000 });
  await shot("b03-permission");
  await page.getByRole("button", { name: "Permitir", exact: true }).click();
  await idle();
  const e = await editor();
  expect(e.past === before + 1, `expected one undo step, got ${e.past - before}`);
  await page.locator(".agent-tool .agent-tool-head").last().click();
  await shot("b04-edited");
});

if (!live) {
  await step("a question from the agent is answered from the panel", async () => {
    await say("ask");
    await page.getByRole("button", { name: "blue" }).click();
    await shot("b05-question");
    await page.getByRole("button", { name: "Responder" }).click();
    await idle();
    expect((await lastAnswer()) === "You chose blue", `unexpected answer: ${await lastAnswer()}`);
  });

  await step("a plan is approved with the mode to go on in", async () => {
    await say('tool plan_ready {"plan":"1. Renomear o passo sm2."}');
    await page.getByRole("button", { name: "Aprovar e editar automaticamente" }).waitFor();
    await shot("b06-plan");
    await page.getByRole("button", { name: "Aprovar e editar automaticamente" }).click();
    await idle();
    expect((await page.evaluate(() => window.__agent.getState().mode)) === "auto", "the mode did not change");
    await page.evaluate(() => window.__agent.getState().setMode("ask"));
  });

  await step("Stop interrupts a turn and keeps what was written", async () => {
    await say("slow");
    await page.locator(".agent-send.is-stop").click({ timeout: 10_000 });
    await idle();
    await page.getByText("Interrompido.").last().waitFor();
  });

  await step("a user's MCP server, from the preferences, is called after approval", async () => {
    await page.evaluate(async (server) => {
      const prefs = window.__prefs.getState();
      await prefs.save({ agent: { ...prefs.agent, mcp: JSON.stringify({ mcpServers: { glossary: { command: server.node, args: [server.script] } } }) } });
      await window.__agent.getState().newSession();
    }, { node: process.execPath, script: FAKE_MCP });
    await page.waitForFunction(() => window.__agent.getState().mcp.some((m) => m.name === "glossary" && m.status === "connected"), null, { timeout: 30_000 });
    await say('mcp glossary lookup {"term":"vetor"}');
    await page.getByRole("button", { name: "Permitir", exact: true }).click({ timeout: 30_000 });
    await idle();
    expect((await lastAnswer()).includes("vetor: a term from the glossary"), `unexpected answer: ${await lastAnswer()}`);
    await shot("b07-mcp");
  });

  await step("the conversations are listed and one is reopened with what was on screen", async () => {
    const first = await page.evaluate(() => window.__agent.getState().conversationId);
    await page.locator(".agent-title").click();
    const rows = page.locator(".agent-session");
    await rows.first().waitFor();
    expect((await rows.count()) >= 2, `expected two conversations, got ${await rows.count()}`);
    await shot("b08-sessions");
    await page.locator(".agent-session-open", { hasText: "Olá" }).click();
    await page.waitForFunction((id) => window.__agent.getState().conversationId !== id && window.__agent.getState().items.length > 0, first);
    expect((await agent()).items.includes("tool"), "the reopened conversation lost its tool cards");
    await page.waitForFunction(() => !!window.__agent.getState().sessionId, null, { timeout: 30_000 });
    await say("again");
    await idle();
    expect((await lastAnswer()).includes("[history "), `the reopened conversation did not answer: ${await lastAnswer()}`);
  });
}

await browser.close();
bridge.close();
if (!live) rmSync(dataDir, { recursive: true, force: true });
if (problems.length) {
  console.log("\nProblems:\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log("\nall good");
