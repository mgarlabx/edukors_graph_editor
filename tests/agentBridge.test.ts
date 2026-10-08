/**
 * The editor's tools over the local MCP server (agent/mcpBridge.mjs), which is
 * how every provider but Claude Code reaches them: the tools are there, the
 * gate decides them, the questions and the plan come back as text for the
 * model, and nothing answers without the process's token.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// @ts-expect-error -- the agent's process is plain JavaScript, checked by JSDoc
import { startBridge } from "../agent/mcpBridge.mjs";
// @ts-expect-error -- as above
import { toolsFor } from "../agent/tools.mjs";

type Verdict = { allow: true } | { allow: false; message: string };

const calls: { name: string; args: Record<string, unknown> }[] = [];
const gated: string[] = [];
const events: any[] = [];
let verdict: Verdict = { allow: true };
let bridge: { url: string; token: string; close: () => void };
let client: Client;

const callEditor = async (name: string, args: Record<string, unknown>) => {
  calls.push({ name, args });
  if (name === "validate_course") return { content: [{ type: "text" as const, text: "2 errors" }], isError: true };
  return { content: [{ type: "text" as const, text: `${name} done` }] };
};

beforeAll(async () => {
  bridge = await startBridge({
    tools: toolsFor(true),
    callEditor,
    gate: async (tool: string) => {
      gated.push(tool);
      return verdict;
    },
    askQuestions: async (input: Record<string, unknown>) => {
      const questions = (input.questions ?? []) as { question: string }[];
      return { allow: true as const, text: questions.map((q) => `${q.question}: 6º ano`).join("\n") };
    },
    askPlan: async () => ({ allow: false as const, message: "The person wants to keep planning." }),
    emit: (ev: unknown) => events.push(ev),
    log: () => undefined,
  });
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(bridge.url), { requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } } }));
});

afterAll(async () => {
  await client.close();
  bridge.close();
});

describe("agent MCP bridge", () => {
  it("offers every tool, the editor's and the two the panel answers", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toContain("edit_course");
    expect(names).toContain("ask_user");
    expect(names).toContain("plan_ready");
    expect(names).toHaveLength(11);
  });

  it("runs a tool in the editor and shows the call in the conversation", async () => {
    events.length = 0;
    const result = (await client.callTool({ name: "read_course", arguments: { full: true } })) as { content: { text: string }[]; isError?: boolean };
    expect(result.content[0].text).toBe("read_course done");
    expect(calls.at(-1)).toEqual({ name: "read_course", args: { full: true } });
    expect(events.map((e) => e.ev)).toEqual(["assistant", "tool_result"]);
    expect(events[0].blocks[0]).toMatchObject({ type: "tool_use", name: "mcp__edukors__read_course", input: { full: true } });
    expect(events[1]).toMatchObject({ toolUseId: events[0].uuid, text: "read_course done" });
  });

  it("asks the gate with the name the panel shows, and passes the denial to the model", async () => {
    verdict = { allow: false, message: "Plan mode is on: do not change the course yet." };
    const result = (await client.callTool({ name: "edit_course", arguments: { summary: "x", operations: [{ op: "delete_node", id: "q1" }] } })) as { content: { text: string }[]; isError?: boolean };
    expect(gated.at(-1)).toBe("mcp__edukors__edit_course");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Plan mode is on");
    // Denied means not done: the editor never saw it.
    expect(calls.some((c) => c.name === "edit_course")).toBe(false);
    verdict = { allow: true };
  });

  it("carries the editor's own error back as an error", async () => {
    const result = (await client.callTool({ name: "validate_course", arguments: {} })) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("2 errors");
  });

  it("brings the person's answer back as text", async () => {
    const result = (await client.callTool({
      name: "ask_user",
      arguments: { questions: [{ question: "Para qual ano?", options: [{ label: "6º ano" }, { label: "9º ano" }] }] },
    })) as { content: { text: string }[] };
    expect(result.content[0].text).toBe("Para qual ano?: 6º ano");
  });

  it("tells the model when the plan was not approved", async () => {
    const result = (await client.callTool({ name: "plan_ready", arguments: { plan: "1. ler" } })) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("keep planning");
  });

  it("refuses a request without the process's token", async () => {
    const res = await fetch(bridge.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: "tools/list", id: 1 }) });
    expect(res.status).toBe(401);
    const wrong = await fetch(bridge.url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer nope" }, body: "{}" });
    expect(wrong.status).toBe(401);
  });
});
