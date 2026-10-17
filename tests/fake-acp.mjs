#!/usr/bin/env node
// A stand-in for Kiro's and Kimi's CLIs, for the tests: `kiro-cli acp` and
// `kimi acp` speak the Agent Client Protocol (JSON-RPC 2.0 over stdio), and
// reach the editor's tools through the MCP servers the editor gave them, as
// the real ones would: Kiro in its agent's file, Kimi with each session.
// FAKE_ACP=kiro or kimi says which one it plays.
//
// What it does with a turn: reads the course and asks to edit it, then
// answers. A message with "comando" makes it ask to run one, "arquivo" makes
// it ask to write a file, and "devagar" makes it take its time, so a test can
// interrupt it. FAKE_ACP_SIGNED_OUT=1 plays an account nobody has signed in to.
// What the editor set up is written where the test can read it (fake-acp.json).
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const flavor = process.env.FAKE_ACP ?? "kimi";
const signedOut = Boolean(process.env.FAKE_ACP_SIGNED_OUT);
const args = process.argv.slice(2);

if (args.includes("--version")) {
  console.log(flavor === "kiro" ? "kiro-cli 2.32.0" : "2.2.0");
  process.exit(0);
}
if (args[0] === "whoami") {
  console.log(JSON.stringify({ account: signedOut ? null : { email: "professora@exemplo.org", license: "free" } }));
  process.exit(signedOut ? 1 : 0);
}
if (args[0] !== "acp") process.exit(2);
// Kiro will not start its ACP server without an account.
if (flavor === "kiro" && signedOut) {
  console.error("error: You are not logged in, please log in with kiro-cli login");
  process.exit(1);
}

const out = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
const update = (sessionId, u) => out({ method: "session/update", params: { sessionId, update: u } });
let nextId = 1000;
const waiting = new Map();
const askEditor = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    out({ id, method, params });
  });

/** What the editor set up, for the test. */
const seen = { args, cwd: process.cwd(), sessions: [], config: [] };
const note = () => writeFileSync(join(process.cwd(), "fake-acp.json"), JSON.stringify(seen, null, 2));
if (flavor === "kimi") {
  const home = process.env.KIMI_CODE_HOME ?? ".";
  seen.system = readFileSync(join(home, "SYSTEM.md"), "utf8");
  seen.toml = readFileSync(join(home, "config.toml"), "utf8");
} else {
  seen.agent = JSON.parse(readFileSync(join(process.cwd(), ".kiro", "agents", "edukors.json"), "utf8"));
}
note();

/** The editor's MCP server, wherever this flavor was given it. */
let server = null;
const serverOf = (mcpServers) => {
  if (flavor === "kimi") {
    const s = (mcpServers ?? []).find((m) => m.name === "edukors");
    return s && { url: s.url, headers: Object.fromEntries(s.headers.map((h) => [h.name, h.value])) };
  }
  const s = seen.agent.mcpServers.edukors;
  return { url: s.url, headers: Object.fromEntries(Object.entries(s.headers).map(([k, v]) => [k, v.replace("${EDUKORS_MCP_TOKEN}", process.env.EDUKORS_MCP_TOKEN ?? "")])) };
};
let client = null;
const call = async (name, input) => {
  if (!client) {
    client = new Client({ name: "fake-acp", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
  }
  const result = await client.callTool({ name, arguments: input });
  return { text: (result.content ?? []).map((c) => c.text ?? "").join("\n"), isError: Boolean(result.isError) };
};

const OPTIONS = [
  { optionId: "approve_once", name: "Approve once", kind: "allow_once" },
  { optionId: "approve_always", name: "Approve for this session", kind: "allow_always" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
];
/** Asks the editor about a call it announced, naming only its id, as Kimi does. */
const permitted = async (sessionId, toolCallId, title) => {
  const answer = await askEditor("session/request_permission", { sessionId, options: OPTIONS, toolCall: { toolCallId, title, content: [{ type: "content", content: { type: "text", text: `Requesting approval to ${title}` } }] } });
  return answer?.outcome?.outcome === "selected" && String(answer.outcome.optionId).startsWith("approve");
};

let cancelled = false;
let serial = 0;
const models = { modelId: "k3", effort: "high" };

/** A call to the editor's server, announced and settled as an agent does. */
async function mcpCall(sessionId, tool, input) {
  const id = `call_${++serial}`;
  const title = flavor === "kimi" ? `mcp__edukors__${tool}` : `Running tool ${tool} with the param (from mcp server: edukors)`;
  update(sessionId, { sessionUpdate: "tool_call", toolCallId: id, title, kind: "other", status: "pending", content: [{ type: "content", content: { type: "text", text: JSON.stringify(input) } }] });
  // Kimi asks first; Kiro was told the editor's server is allowed.
  if (flavor === "kimi" && !(await permitted(sessionId, id, title))) {
    update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: id, status: "failed", rawOutput: "rejected" });
    return { text: "rejected", isError: true };
  }
  const result = await call(tool, input);
  update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: id, status: result.isError ? "failed" : "completed", content: [{ type: "content", content: { type: "text", text: result.text } }], rawOutput: result.text });
  return result;
}

/** A tool of the agent's own: announced, asked about, then run or not. */
async function ownCall(sessionId, kind, title, input) {
  const id = `call_${++serial}`;
  update(sessionId, { sessionUpdate: "tool_call", toolCallId: id, title, kind, status: "pending", content: [{ type: "content", content: { type: "text", text: JSON.stringify(input) } }] });
  const ok = await permitted(sessionId, id, title);
  update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: id, status: ok ? "completed" : "failed", rawInput: input, content: [{ type: "content", content: { type: "text", text: ok ? "samples/" : `Tool "${title}" was not run because the user rejected the approval request.` } }] });
  return ok;
}

async function prompt(sessionId, text) {
  cancelled = false;
  if (/devagar/i.test(text)) {
    for (let i = 0; i < 60 && !cancelled; i++) await new Promise((r) => setTimeout(r, 50));
    if (cancelled) return { stopReason: "cancelled" };
  }
  let said = "Pronto.";
  if (/comando/i.test(text)) said = (await ownCall(sessionId, "execute", "Bash", { command: "ls samples" })) ? "Rodei o comando." : "Não rodei o comando.";
  else if (/arquivo/i.test(text)) said = (await ownCall(sessionId, "edit", "Write", { path: "/tmp/x.txt", content: "x" })) ? "Escrevi." : "Não escrevi o arquivo.";
  else {
    update(sessionId, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Vou ler o curso." } });
    const outline = await mcpCall(sessionId, "read_course", {});
    const edit = await mcpCall(sessionId, "edit_course", {
      summary: "Adiciona um passo sim/não depois de sm5",
      operations: [
        { op: "add_node", node: { id: "b1", type: "bool", title: [{ lang: "en", text: "More?" }], content: { question: [{ lang: "en", text: "Want more?" }] } }, near: "sm5" },
        { op: "set_edges", from: "sm5", edges: [{ to: "b1" }] },
      ],
    });
    said = edit.isError ? `Não pude editar: ${edit.text}` : `Pronto. O curso dizia: ${outline.text.slice(0, 20)}`;
  }
  for (const piece of said.match(/.{1,10}/gs) ?? []) {
    update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: piece } });
    await new Promise((r) => setTimeout(r, 5));
  }
  return { stopReason: "end_turn" };
}

const configOptions = () => [
  { id: "model", name: "Model", category: "model", type: "select", currentValue: models.modelId, options: [{ value: "k3", name: "K3" }, { value: "kimi-for-coding", name: "Kimi for Coding" }] },
  { id: "effort", name: "Thinking", category: "thought_level", type: "select", currentValue: models.effort, options: [{ value: "low", name: "Low" }, { value: "high", name: "High" }, { value: "max", name: "Max" }] },
];
const kiroModels = () => ({ currentModelId: "auto", availableModels: [{ modelId: "auto", name: "Auto" }, { modelId: "claude-sonnet-5", name: "Claude Sonnet 5" }] });
const opened = (sessionId) => (flavor === "kimi" ? { sessionId, configOptions: configOptions() } : { sessionId, models: kiroModels() });

const handlers = {
  initialize: () => ({
    protocolVersion: 1,
    agentCapabilities: flavor === "kimi" ? { loadSession: true, sessionCapabilities: { resume: {}, close: {}, delete: {} }, mcpCapabilities: { http: true } } : { loadSession: true },
    agentInfo: { name: flavor, version: "1.0.0" },
  }),
  "session/new": (params) => {
    if (signedOut) throw Object.assign(new Error("Authentication required"), { code: -32000 });
    server = serverOf(params.mcpServers);
    const sessionId = `sess_${seen.sessions.length + 1}`;
    seen.sessions.push({ new: sessionId, mcpServers: params.mcpServers });
    note();
    return opened(sessionId);
  },
  "session/resume": (params) => {
    server = serverOf(params.mcpServers);
    seen.sessions.push({ resume: params.sessionId });
    note();
    return opened(params.sessionId);
  },
  "session/load": (params) => {
    server = serverOf(params.mcpServers);
    seen.sessions.push({ load: params.sessionId });
    note();
    // Loading replays the conversation, which the editor already has.
    update(params.sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "(replayed)" } });
    return opened(params.sessionId);
  },
  "session/set_config_option": (params) => {
    if (params.configId === "model") models.modelId = params.value;
    if (params.configId === "effort") models.effort = params.value;
    seen.config.push(params);
    note();
    return { configOptions: configOptions() };
  },
  "session/set_model": (params) => {
    seen.config.push(params);
    note();
    return {};
  },
  "session/prompt": (params) => prompt(params.sessionId, (params.prompt ?? []).map((b) => b.text ?? "").join("\n")),
  "session/close": () => ({}),
  "session/delete": (params) => {
    seen.sessions.push({ delete: params.sessionId });
    note();
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
  if (msg.jsonrpc !== "2.0") {
    if (msg.id !== undefined) out({ id: msg.id, error: { code: -32600, message: "Invalid Request" } });
    return;
  }
  if (msg.id !== undefined && msg.method === undefined) {
    const resolve = waiting.get(msg.id);
    if (resolve) {
      waiting.delete(msg.id);
      resolve(msg.result ?? null);
    }
    return;
  }
  if (msg.method === "session/cancel") {
    cancelled = true;
    return;
  }
  const handler = handlers[msg.method];
  if (!handler) {
    if (msg.id !== undefined) out({ id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
    return;
  }
  try {
    const result = await handler(msg.params ?? {});
    if (msg.id !== undefined) out({ id: msg.id, result });
  } catch (e) {
    if (msg.id !== undefined) out({ id: msg.id, error: { code: e?.code ?? -32603, message: String(e?.message ?? e) } });
  }
});
