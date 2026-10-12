/**
 * The person's own MCP servers, for the providers that run as a CLI of their
 * own (agent/mcpProxy.mjs): the agent's process connects to each one and the
 * bridge serves it again at `/mcp/<name>`, so every call is shown in the
 * conversation and decided by the editor's gate, as the editor's own tools are.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// @ts-expect-error -- the agent's process is plain JavaScript, checked by JSDoc
import { startBridge } from "../agent/mcpBridge.mjs";
// @ts-expect-error -- as above
import { createProxy } from "../agent/mcpProxy.mjs";
// @ts-expect-error -- as above
import { toolsFor } from "../agent/tools.mjs";

type Verdict = { allow: true } | { allow: false; message: string };

const FAKE = { type: "stdio", command: process.execPath, args: [join(__dirname, "fake-mcp-server.mjs")] };
const gated: string[] = [];
const events: any[] = [];
const changes: any[][] = [];
let verdict: Verdict = { allow: true };
let proxy: any;
let bridge: { url: string; token: string; close: () => void };

const auth = () => ({ Authorization: `Bearer ${bridge.token}` });

async function connect(name: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge.url}/${name}`), { requestInit: { headers: auth() } }));
  return client;
}

beforeAll(async () => {
  proxy = createProxy({ log: () => undefined, onChange: (states: any[]) => changes.push(states) });
  bridge = await startBridge({
    tools: toolsFor(true),
    callEditor: async () => ({ content: [{ type: "text" as const, text: "" }] }),
    gate: async (tool: string) => {
      gated.push(tool);
      return verdict;
    },
    askQuestions: async () => ({ allow: false as const, message: "" }),
    askPlan: async () => ({ allow: false as const, message: "" }),
    emit: (ev: unknown) => events.push(ev),
    log: () => undefined,
    proxy,
  });
  await proxy.sync({ materiais: FAKE, quebrado: { type: "stdio", command: join(__dirname, "no-such-server") } }, 20_000);
}, 30_000);

afterAll(() => {
  proxy.close();
  bridge.close();
});

describe("the person's MCP servers through the bridge", () => {
  it("connects each server and reports which did not", () => {
    expect(proxy.names().sort()).toEqual(["materiais", "quebrado"]);
    const states = Object.fromEntries(proxy.states().map((s: any) => [s.name, s]));
    expect(states.materiais).toEqual({ name: "materiais", status: "connected" });
    expect(states.quebrado.status).toBe("failed");
    expect(states.quebrado.error).toBeTruthy();
    expect(changes.length).toBeGreaterThan(0);
  });

  it("serves a server's tools under its own address", async () => {
    const client = await connect("materiais");
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["count", "echo"]);
    await client.close();
    // A server that did not connect has no tools, and the CLI still starts.
    const broken = await connect("quebrado");
    expect((await broken.listTools()).tools).toEqual([]);
    await broken.close();
  });

  it("puts each call through the gate and shows it in the conversation", async () => {
    events.length = 0;
    const client = await connect("materiais");
    const result = (await client.callTool({ name: "echo", arguments: { text: "oi" } })) as { content: { text: string }[] };
    expect(result.content[0].text).toBe("eco: oi");
    expect(gated.at(-1)).toBe("mcp__materiais__echo");
    expect(events.map((e) => e.ev)).toEqual(["assistant", "tool_result"]);
    expect(events[0].blocks[0]).toMatchObject({ type: "tool_use", name: "mcp__materiais__echo", input: { text: "oi" } });
    expect(events[1]).toMatchObject({ toolUseId: events[0].uuid, text: "eco: oi" });
    await client.close();
  });

  it("never reaches the server when the gate says no", async () => {
    verdict = { allow: false, message: "The person declined this action." };
    const client = await connect("materiais");
    const denied = (await client.callTool({ name: "echo", arguments: { text: "não" } })) as { content: { text: string }[]; isError?: boolean };
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain("declined");
    verdict = { allow: true };
    const count = (await client.callTool({ name: "count", arguments: {} })) as { content: { text: string }[] };
    expect(count.content[0].text).toBe("1");
    await client.close();
  });

  it("serves nothing for a server that is not the person's, nor without the token", async () => {
    const res = await fetch(`${bridge.url}/outro`, { method: "POST", headers: { ...auth(), "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(404);
    const anon = await fetch(`${bridge.url}/materiais`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(anon.status).toBe(401);
  });

  it("lets go of a server taken out of the preferences", async () => {
    await proxy.sync({ materiais: FAKE }, 0);
    expect(proxy.names()).toEqual(["materiais"]);
    await proxy.sync({}, 0);
    expect(proxy.names()).toEqual([]);
    const res = await fetch(`${bridge.url}/materiais`, { method: "POST", headers: { ...auth(), "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(404);
  });
});
