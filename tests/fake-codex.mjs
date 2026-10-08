#!/usr/bin/env node
// A stand-in for OpenAI's Codex CLI, for the tests: `codex app-server` speaks
// JSON-RPC over stdio, without the "jsonrpc" field, and reaches the editor's
// tools through the MCP server the editor wrote in its config.toml, as the
// real one would.
//
// What it does with a turn: reads the course and asks to edit it, then
// answers. A message with "comando" makes it ask to run one, "pergunte" makes
// it ask the person, and "devagar" makes it take its time, so a test can
// interrupt it. FAKE_CODEX_SIGNED_OUT=1 plays an account nobody has signed in to.
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

if (process.argv.includes("--version")) {
  console.log("codex-cli 0.161.0 (fake)");
  process.exit(0);
}

const home = process.env.CODEX_HOME ?? ".";
const config = readFileSync(join(home, "config.toml"), "utf8");
const url = /^url = "(.+)"$/m.exec(config)?.[1];
const tokenVar = /^bearer_token_env_var = "(.+)"$/m.exec(config)?.[1] ?? "";
const token = process.env[tokenVar];

const out = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const notify = (method, params) => out({ method, params });
let nextId = 1000;
const waiting = new Map();
/** Asks the editor something and waits for its answer, as the app server does. */
const askEditor = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    out({ id, method, params });
  });

let client = null;
const tools = async () => {
  if (!client) {
    client = new Client({ name: "fake-codex", version: "0.161.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  }
  return client;
};
const call = async (name, args) => {
  const api = await tools();
  const result = await api.callTool({ name, arguments: args });
  return { text: (result.content ?? []).map((c) => c.text ?? "").join("\n"), isError: Boolean(result.isError) };
};

let turns = [];
let cancelled = false;
let item = 0;
const nextItem = () => `item_${++item}`;

async function runTurn(threadId, text) {
  const turnId = `turn_${turns.length + 1}`;
  cancelled = false;
  notify("turn/started", { turn: { id: turnId } });
  if (/devagar/i.test(text)) {
    for (let i = 0; i < 40 && !cancelled; i++) await new Promise((r) => setTimeout(r, 50));
    if (cancelled) return;
  }
  const items = [{ id: nextItem(), type: "userMessage", content: [{ type: "text", text }] }];
  let said = "Pronto.";
  if (/comando/i.test(text)) {
    const id = nextItem();
    // The command comes as one string, and the answer is accept or decline.
    const decision = await askEditor("item/commandExecution/requestApproval", { itemId: id, threadId, turnId, startedAtMs: Date.now(), command: "bash -lc ls samples", cwd: process.cwd() });
    const allowed = decision?.decision === "accept";
    const done = { id, type: "commandExecution", command: ["bash", "-lc", "ls samples"], status: allowed ? "completed" : "failed", output: allowed ? "samples/" : "denied" };
    notify("item/started", { item: { id, type: "commandExecution", command: done.command } });
    notify("item/completed", { item: done });
    items.push(done);
    said = allowed ? "Rodei o comando." : "Não rodei o comando.";
  } else if (/pergunte/i.test(text)) {
    const id = nextItem();
    const answer = await askEditor("item/tool/requestUserInput", {
      itemId: id,
      threadId,
      turnId,
      isBlocking: true,
      questions: [{ id: "q_ano", header: "Ano", question: "Para qual ano?", options: [{ label: "6º ano" }, { label: "9º ano" }] }],
    });
    // The answers come back by question id, each with what was picked.
    said = `A pessoa disse: ${(answer?.answers?.q_ano?.answers ?? []).join(", ")}`;
  } else {
    const id = nextItem();
    // Before calling an MCP server, Codex puts it to whoever drives it.
    const allowed = await askEditor("mcpServer/elicitation/request", {
      serverName: "edukors",
      threadId,
      turnId,
      message: "Allow edukors to run read_course?",
      mode: "form",
      requestedSchema: { type: "object", properties: {} },
    });
    if (allowed?.action !== "accept") {
      notify("turn/completed", { turn: { id: turnId, status: "completed" } });
      return;
    }
    notify("item/started", { item: { id, type: "mcpToolCall", server: "edukors", tool: "read_course", arguments: {} } });
    const outline = await call("read_course", {});
    notify("item/completed", { item: { id, type: "mcpToolCall", server: "edukors", tool: "read_course", status: "completed", output: outline.text } });
    const edit = await call("edit_course", {
      summary: "Adiciona um passo sim/não depois de sm5",
      operations: [
        { op: "add_node", node: { id: "b1", type: "bool", title: [{ lang: "en", text: "More?" }], content: { question: [{ lang: "en", text: "Want more?" }] } }, near: "sm5" },
        { op: "set_edges", from: "sm5", edges: [{ to: "b1" }] },
      ],
    });
    said = edit.isError ? `Não pude editar: ${edit.text}` : `Pronto. O curso dizia: ${outline.text.slice(0, 20)}`;
  }
  const messageId = nextItem();
  notify("item/started", { item: { id: messageId, type: "agentMessage" } });
  for (const piece of said.match(/.{1,10}/g) ?? []) {
    notify("item/agentMessage/delta", { itemId: messageId, delta: { type: "text_delta", text: piece } });
    await new Promise((r) => setTimeout(r, 5));
  }
  const message = { id: messageId, type: "agentMessage", content: [{ type: "text", text: said }], status: "completed" };
  notify("item/completed", { item: message });
  items.push(message);
  turns.push({ id: turnId, items });
  if (!cancelled) notify("turn/completed", { turn: { id: turnId, status: "completed" } });
}

const handlers = {
  initialize: () => ({ userAgent: "fake-codex" }),
  "account/read": () =>
    process.env.FAKE_CODEX_SIGNED_OUT
      ? { account: null, requiresOpenaiAuth: true }
      : { account: { type: "chatgpt", email: "professora@exemplo.org", planType: "pro" }, requiresOpenaiAuth: false },
  "account/login/start": () => {
    setTimeout(() => notify("account/login/completed", { loginId: "l1", success: true }), 50);
    return { authUrl: "https://auth.example/device", loginId: "l1" };
  },
  "model/list": () => ({
    data: [
      { id: "gpt-6.1-sol", displayName: "GPT-6.1 Sol", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "medium" }, { reasoningEffort: "high" }] },
      { id: "gpt-6.1-mini", displayName: "GPT-6.1 Mini" },
      { id: "internal", displayName: "Internal", hidden: true },
    ],
  }),
  "thread/start": (params) => {
    // The prompt the editor gave is kept where the test can read it.
    writeFileSync(join(home, "last-thread.json"), JSON.stringify(params, null, 2));
    turns = [];
    return { thread: { id: "thr_fake", sessionId: "thr_fake", createdAt: 1790000000 } };
  },
  "thread/resume": (params) => ({ thread: { id: params.threadId } }),
  "thread/list": () => ({ data: [{ id: "thr_fake", name: "Conversa de teste", preview: "Adicione um passo", updatedAt: 1790000000 }] }),
  "thread/read": () => ({ thread: { id: "thr_fake", name: "Conversa de teste", turns } }),
  "thread/archive": () => ({}),
  "thread/unsubscribe": () => ({ status: "unsubscribed" }),
  "turn/start": (params) => {
    const text = (params.input ?? []).map((i) => i.text ?? "").join("\n");
    setTimeout(() => runTurn(params.threadId, text), 5);
    return { turn: { id: `turn_${turns.length + 1}` } };
  },
  "turn/interrupt": (params) => {
    cancelled = true;
    notify("turn/completed", { turn: { id: params.turnId ?? "turn_x", status: "interrupted" } });
    return {};
  },
};

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id !== undefined && msg.method === undefined) {
    // The editor's answer to something this process asked.
    const resolve = waiting.get(msg.id);
    if (resolve) {
      waiting.delete(msg.id);
      resolve(msg.result ?? null);
    }
    return;
  }
  if (msg.method === "initialized") return;
  const handler = handlers[msg.method];
  if (!handler) {
    if (msg.id !== undefined) out({ id: msg.id, error: { code: -32601, message: `no such method: ${msg.method}` } });
    return;
  }
  try {
    const result = await handler(msg.params ?? {});
    if (msg.id !== undefined) out({ id: msg.id, result });
  } catch (e) {
    if (msg.id !== undefined) out({ id: msg.id, error: { code: -32603, message: String(e?.message ?? e) } });
  }
});
