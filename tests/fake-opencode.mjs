#!/usr/bin/env node
// A stand-in for OpenCode, for the tests: `opencode serve` listens on
// 127.0.0.1 behind the password it is given, answers the HTTP calls the editor
// makes and sends what happens as server-sent events, and reaches the
// editor's tools through the MCP servers named in OPENCODE_CONFIG_CONTENT, as
// the real one would.
//
// What it does with a turn: thinks, reads the course and asks to edit it,
// then answers, a few words at a time. A message with "materiais" makes it
// call the person's own server of that name, "grátis" makes it fail as
// OpenCode Zen's free models do, and "devagar" makes it take its time, so a
// test can interrupt it. FAKE_OPENCODE_SIGNED_OUT=1 plays an install with no
// provider connected but Zen's free one.
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

if (process.argv.includes("--version")) {
  console.log("1.19.0");
  process.exit(0);
}
if (process.argv.includes("--help")) {
  console.log("opencode serve  starts a headless opencode server\n  --pure  run without external plugins");
  process.exit(0);
}

const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? "{}");
// What the editor gave, where the test can read it.
writeFileSync(join(process.cwd(), "last-config.json"), JSON.stringify({ config, argv: process.argv.slice(2), env: { claude: process.env.OPENCODE_DISABLE_CLAUDE_CODE, skills: process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS } }, null, 2));
const auth = `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME ?? "opencode"}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString("base64")}`;

const zen = { id: "opencode", name: "OpenCode Zen", source: "custom", options: { apiKey: "public" }, models: { "big-pickle": { id: "big-pickle", name: "Big Pickle" } } };
const providers = process.env.FAKE_OPENCODE_SIGNED_OUT
  ? { providers: [zen], default: { opencode: "big-pickle" } }
  : {
      providers: [
        zen,
        {
          id: "anthropic",
          name: "Anthropic",
          source: "api",
          options: {},
          models: {
            "claude-sonnet-5-5": { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", variants: { high: {}, max: {} } },
            "claude-old": { id: "claude-old", name: "Claude Old", status: "deprecated" },
          },
        },
      ],
      default: { opencode: "big-pickle", anthropic: "claude-sonnet-5-5" },
    };

/** @type {Set<import("node:http").ServerResponse>} */
const streams = new Set();
const publish = (type, properties) => {
  const data = `data: ${JSON.stringify({ id: `evt_${Date.now()}`, type, properties })}\n\n`;
  for (const res of streams) res.write(data);
};

/** @type {Map<string, { info: any; messages: { info: any; parts: any[] }[] }>} */
const sessions = new Map();
let counter = 0;
const next = (prefix) => `${prefix}_${String(++counter).padStart(4, "0")}`;
let cancelled = false;
let busy = false;

const clients = new Map();
async function call(server, name, args) {
  if (!clients.has(server)) {
    const entry = config.mcp?.[server];
    const client = new Client({ name: "fake-opencode", version: "1.19.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(entry.url), { requestInit: { headers: entry.headers } }));
    clients.set(server, client);
  }
  const result = await clients.get(server).callTool({ name, arguments: args });
  return { text: (result.content ?? []).map((c) => c.text ?? "").join("\n"), isError: Boolean(result.isError) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runTurn(sid, body) {
  const session = sessions.get(sid);
  const text = (body.parts ?? []).map((p) => p.text ?? "").join("\n");
  writeFileSync(join(process.cwd(), "last-prompt.json"), JSON.stringify(body, null, 2));
  cancelled = false;
  busy = true;
  const user = { info: { id: next("msg"), sessionID: sid, role: "user", time: { created: Date.now() }, agent: body.agent, system: body.system }, parts: [] };
  user.parts.push({ id: next("prt"), sessionID: sid, messageID: user.info.id, type: "text", text });
  session.messages.push(user);
  publish("message.updated", { sessionID: sid, info: user.info });
  publish("message.part.updated", { sessionID: sid, part: user.parts[0], time: Date.now() });
  publish("session.status", { sessionID: sid, status: { type: "busy" } });
  const reply = { info: { id: next("msg"), sessionID: sid, role: "assistant", time: { created: Date.now() }, modelID: body.model?.modelID, providerID: body.model?.providerID }, parts: [] };
  session.messages.push(reply);
  publish("message.updated", { sessionID: sid, info: reply.info });
  const part = (p) => {
    const full = { id: next("prt"), sessionID: sid, messageID: reply.info.id, ...p };
    reply.parts.push(full);
    publish("message.part.updated", { sessionID: sid, part: full, time: Date.now() });
    return full;
  };
  const update = (full, change) => {
    Object.assign(full, change);
    publish("message.part.updated", { sessionID: sid, part: full, time: Date.now() });
  };
  const finish = (error) => {
    busy = false;
    if (error) {
      reply.info.error = error;
      publish("session.error", { sessionID: sid, error });
    }
    reply.info.time.completed = Date.now();
    publish("message.updated", { sessionID: sid, info: reply.info });
    publish("session.status", { sessionID: sid, status: { type: "idle" } });
    publish("session.idle", { sessionID: sid });
  };

  if (/devagar/i.test(text)) {
    for (let i = 0; i < 60 && !cancelled; i++) await sleep(50);
    if (cancelled) return finish({ name: "MessageAbortedError", data: { message: "The operation was aborted." } });
  }
  if (/grátis/i.test(text)) {
    return finish({
      name: "APIError",
      data: { message: "OpenCode's free tier can only be used from within OpenCode.", statusCode: 403, responseBody: '{"type":"error","error":{"type":"FreeTierError"}}' },
    });
  }

  const thought = part({ type: "reasoning", text: "", time: { start: Date.now() } });
  publish("message.part.delta", { sessionID: sid, messageID: reply.info.id, partID: thought.id, field: "text", delta: "Vou ler o curso." });
  update(thought, { text: "Vou ler o curso.", time: { start: thought.time.start, end: Date.now() } });

  let said;
  if (/materiais/i.test(text)) {
    const tool = part({ type: "tool", tool: "materiais_echo", callID: "call_echo", state: { status: "running", input: { text: "oi" }, time: { start: Date.now() } } });
    const result = await call("materiais", "echo", { text: "oi" });
    update(tool, { state: { status: "completed", input: { text: "oi" }, output: result.text, title: "", metadata: {}, time: { start: 1, end: 2 } } });
    said = `O servidor disse: ${result.text}`;
  } else {
    const read = part({ type: "tool", tool: "edukors_read_course", callID: "call_read", state: { status: "running", input: {}, time: { start: Date.now() } } });
    const outline = await call("edukors", "read_course", {});
    update(read, { state: { status: "completed", input: {}, output: outline.text, title: "", metadata: {}, time: { start: 1, end: 2 } } });
    const operations = [
      { op: "add_node", node: { id: "b1", type: "bool", title: [{ lang: "en", text: "More?" }], content: { question: [{ lang: "en", text: "Want more?" }] } }, near: "sm5" },
      { op: "set_edges", from: "sm5", edges: [{ to: "b1" }] },
    ];
    const edit = part({ type: "tool", tool: "edukors_edit_course", callID: "call_edit", state: { status: "running", input: { operations }, time: { start: Date.now() } } });
    const edited = await call("edukors", "edit_course", { summary: "Adiciona um passo sim/não depois de sm5", operations });
    update(edit, { state: edited.isError ? { status: "error", input: { operations }, error: edited.text, time: { start: 1, end: 2 } } : { status: "completed", input: { operations }, output: edited.text, title: "", metadata: {}, time: { start: 1, end: 2 } } });
    // A skill, which is OpenCode's own tool: the panel shows it as one.
    const skill = part({ type: "tool", tool: "skill", callID: "call_skill", state: { status: "running", input: { name: "estilo" }, time: { start: Date.now() } } });
    update(skill, { state: { status: "completed", input: { name: "estilo" }, output: "Escreva frases curtas.", title: "", metadata: {}, time: { start: 1, end: 2 } } });
    said = edited.isError ? `Não pude editar: ${edited.text}` : `Pronto. O curso dizia: ${outline.text.slice(0, 20)}`;
  }
  const answer = part({ type: "text", text: "", time: { start: Date.now() } });
  for (const piece of said.match(/.{1,10}/g) ?? []) {
    publish("message.part.delta", { sessionID: sid, messageID: reply.info.id, partID: answer.id, field: "text", delta: piece });
    await sleep(5);
  }
  update(answer, { text: said, time: { start: answer.time.start, end: Date.now() } });
  session.info.title = "Conversa de teste";
  session.info.time.updated = 1790000000000;
  finish(null);
}

const json = (res, status, data) => res.writeHead(status, { "content-type": "application/json" }).end(data === undefined ? "" : JSON.stringify(data));

const http = createServer((req, res) => {
  if (req.headers.authorization !== auth) return json(res, 401, { error: "unauthorized" });
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const input = body ? JSON.parse(body) : {};
    if (path === "/event") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ type: "server.connected", properties: {} })}\n\n`);
      streams.add(res);
      res.on("close", () => streams.delete(res));
      return;
    }
    if (path === "/config/providers") return json(res, 200, providers);
    if (path === "/config") return json(res, 200, {});
    if (path === "/session" && req.method === "POST") {
      const id = `ses_${String(sessions.size + 1).padStart(4, "0")}`;
      const info = { id, directory: process.cwd(), title: `New session - ${new Date().toISOString()}`, time: { created: 1789000000000, updated: 1789000000000 } };
      sessions.set(id, { info, messages: [] });
      return json(res, 200, info);
    }
    if (path === "/session" && req.method === "GET") {
      // Another folder's session, as OpenCode lists everything that is not a project together.
      const elsewhere = { id: "ses_elsewhere", directory: "/Users/someone/notes", title: "Outra pasta", time: { created: 1, updated: 2 } };
      return json(res, 200, [...[...sessions.values()].map((s) => s.info), elsewhere]);
    }
    const m = /^\/session\/([^/]+)(\/.*)?$/.exec(path);
    if (m) {
      const session = sessions.get(m[1]);
      if (!session) return json(res, 404, { name: "NotFoundError" });
      const rest = m[2] ?? "";
      if (!rest && req.method === "GET") return json(res, 200, session.info);
      if (!rest && req.method === "DELETE") {
        sessions.delete(m[1]);
        return json(res, 200, true);
      }
      if (rest === "/message") return json(res, 200, session.messages);
      if (rest === "/prompt_async") {
        if (busy) return json(res, 409, { name: "SessionBusyError" });
        setTimeout(() => void runTurn(m[1], input), 5);
        return json(res, 204);
      }
      if (rest === "/abort") {
        cancelled = true;
        return json(res, 200, true);
      }
    }
    if (/^\/permission\/[^/]+\/reply$/.test(path)) return json(res, 200, true);
    json(res, 404, { name: "NotFoundError" });
  });
});

http.listen(0, "127.0.0.1", () => {
  const { port } = /** @type {import("node:net").AddressInfo} */ (http.address());
  console.log(`opencode server listening on http://127.0.0.1:${port}`);
});
