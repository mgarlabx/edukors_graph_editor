#!/usr/bin/env node
// A stand-in for Google's Antigravity CLI, for the tests: it takes the flags
// the editor passes, speaks the stream-json protocol its headless mode
// documents, and reaches the editor's tools through the MCP server the editor
// wrote in .agents/mcp_config.json, as the real CLI would.
//
// What it does with a message: reads the course, then asks to edit it, then
// answers in two chunks. A message containing "pergunte" makes it ask the
// person instead, and one containing "planeje" makes it present a plan.
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];

if (args.includes("--help")) {
  // The flags the editor looks for before passing them.
  console.log(`Usage: agy [options]
  -p, --print            Run a single prompt
      --input-format      text | stream-json
      --output-format     text | json | stream-json
      --agent             Agent name
      --model             Model slug
      --conversation      Resume a conversation by id
  -c, --continue          Resume the most recent conversation
      --print-timeout     How long a turn may take
      --disable-slash-commands
      --add-dir           Another folder the agent may read
      --dangerously-skip-permissions`);
  process.exit(0);
}
if (args.includes("--version")) {
  console.log("agy 1.2.2 (fake)");
  process.exit(0);
}
if (args[0] === "models") {
  console.log("MODEL                     DESCRIPTION\ngemini-3.8-flash-high     deep\ngemini-3.8-flash-low      fast");
  process.exit(0);
}

const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const conversation = flag("--conversation") ?? `fake-${Date.now().toString(36)}`;
const config = JSON.parse(readFileSync(join(process.cwd(), ".agents", "mcp_config.json"), "utf8"));
const server = config.mcpServers.edukors;
const agent = readFileSync(join(process.cwd(), ".agents", "agents", flag("--agent") ?? "edukors", "agent.md"), "utf8");

// A slow start, to drive the editor the way the real CLI does: it takes a
// moment before it says hello.
if (process.env.FAKE_AGY_SLOW) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_AGY_SLOW)));

const client = new Client({ name: "fake-agy", version: "1.2.2" });
await client.connect(new StreamableHTTPClientTransport(new URL(server.serverUrl), { requestInit: { headers: server.headers } }));
const tools = (await client.listTools()).tools.map((t) => t.name);

// The real CLI does not offer an MCP tool by name: it has one tool of its own
// that calls any of them, and that is what it reports having.
out({
  event: "init",
  conversation_id: conversation,
  init: { cwd: process.cwd(), tools: ["call_mcp_tool"], mcp_tools: tools, permission_mode: args.includes("--dangerously-skip-permissions") ? "always-proceed" : "request-review" },
});

let step = 0;
const text = async (body) => {
  const index = step++;
  for (const piece of body.match(/.{1,12}/g) ?? []) {
    out({ event: "step_update", step_update: { conversation_id: conversation, step_index: index, state: "ACTIVE", step_type: "agent_response", text_delta: piece } });
    await new Promise((r) => setTimeout(r, 5));
  }
  out({ event: "step_update", step_update: { conversation_id: conversation, step_index: index, state: "DONE", step_type: "agent_response" } });
};
const call = async (name, args) => {
  const index = step++;
  const parameters = { ServerName: "edukors", ToolName: name, Arguments: args };
  const step_update = { conversation_id: conversation, step_index: index, step_type: "tool", tool_name: "call_mcp_tool" };
  out({ event: "step_update", step_update: { ...step_update, state: "ACTIVE", tool_info: { name: "call_mcp_tool", parameters } } });
  const result = await client.callTool({ name, arguments: args });
  const output = (result.content ?? []).map((c) => c.text ?? "").join("\n");
  out({ event: "step_update", step_update: { ...step_update, state: "DONE", tool_info: { name: "call_mcp_tool", parameters, output } } });
  return { output, isError: Boolean(result.isError) };
};

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.exit(1);
  }
  if (message.event !== "user") return;
  const asked = String(message.message?.content ?? "");
  try {
    if (/pergunte/i.test(asked)) {
      const answer = await call("ask_user", { questions: [{ question: "Para qual ano?", header: "Ano", options: [{ label: "6º ano" }, { label: "9º ano" }] }] });
      await text(`A pessoa disse: ${answer.output}`);
    } else if (/planeje/i.test(asked)) {
      await text("## Plano\n1. Ler o curso.");
      const approved = await call("plan_ready", { plan: "1. Ler o curso." });
      await text(approved.isError ? "Fico no plano." : "Pode executar.");
    } else {
      const outline = await call("read_course", {});
      const edit = await call("edit_course", {
        summary: "Adiciona um passo sim/não depois de sm5",
        operations: [
          { op: "add_node", node: { id: "b1", type: "bool", title: [{ lang: "en", text: "More?" }], content: { question: [{ lang: "en", text: "Want more?" }] } }, near: "sm5" },
          { op: "set_edges", from: "sm5", edges: [{ to: "b1" }] },
        ],
      });
      await text(edit.isError ? `Não pude editar: ${edit.output}` : `Pronto. O curso dizia: ${outline.output.slice(0, 20)}`);
    }
    out({ event: "result", result: { conversation_id: conversation, status: "SUCCESS", response: "ok", num_turns: 1, usage: { input_tokens: 10, output_tokens: 5 } } });
  } catch (e) {
    out({ event: "result", result: { conversation_id: conversation, status: "ERROR", response: "", error: String(e?.message ?? e) } });
  }
});
// The prompt the editor wrote is reported once, so a test can check it.
process.stderr.write(`[fake-agy] prompt bytes: ${agent.length}\n`);
