/**
 * The agent's process with OpenCode behind it, the same way round as the
 * Codex one: the panel's requests, the tools the editor runs, the cards the
 * person answers, and the sessions OpenCode keeps.
 *
 * OpenCode is not installed on a machine that only builds the app, so a
 * stand-in plays its server (tests/fake-opencode.mjs): it listens behind the
 * password it is given, sends its events as a stream, and reaches the editor's
 * tools through the MCP servers in the configuration the editor gives it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startSidecar, root, type Sidecar } from "./sidecarHarness";
import { fold } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

const FAKE = join(root, "tests", "fake-opencode.mjs");
const workspace = (agent: Sidecar) => join(agent.cwd, "opencode", "workspace");
const given = (agent: Sidecar, file: string) => JSON.parse(readFileSync(join(workspace(agent), file), "utf8"));

let agent: Sidecar;

beforeAll(async () => {
  agent = await startSidecar({ EDUKORS_OPENCODE: FAKE });
}, 60_000);

afterAll(() => agent.stop());

describe("the agent's process, on OpenCode", () => {
  let sid = "";

  it("is the last provider, finds the CLI and opens a session with the providers the person connected", async () => {
    const ready = agent.lines.find((m) => m.t === "ready");
    expect(ready.providers.map((p: any) => p.id)).toEqual(["claude", "codex", "antigravity", "kiro", "kimi", "opencode"]);
    expect(ready.providers.at(-1)).toMatchObject({ id: "opencode", available: true, version: "1.19.0" });
    const opened: any = await agent.request("open", { provider: "opencode", model: "default", mode: "ask", effort: "auto", instructions: "Fale sempre em português.", mcp: {} });
    sid = opened.sessionId;
    expect(sid).toBe("ses_0001");
    expect(opened.account).toEqual({ provider: "opencode", signedIn: true, plan: "Anthropic" });
    expect(opened.capabilities).toMatchObject({ efforts: true, usage: false, bash: false, skills: true, mcp: true, login: "external", ownQuestions: false });
    // Zen's free models only answer OpenCode's own agent, and a deprecated model is not offered.
    expect(opened.models.map((m: any) => m.value)).toEqual(["default", "anthropic/claude-sonnet-5-5"]);
    expect(opened.models[0]).toMatchObject({ displayName: "Claude Sonnet 5.5", resolved: "anthropic/claude-sonnet-5-5", efforts: ["high", "max"] });
  }, 60_000);

  it("gives OpenCode an agent that may only use the bridge, behind a password, without the person's plugins", () => {
    const { config, argv, env } = given(agent, "last-config.json");
    expect(argv).toEqual(["serve", "--hostname", "127.0.0.1", "--port", "0", "--pure"]);
    expect(env).toEqual({ claude: "1", skills: "1" });
    expect(config.default_agent).toBe("edukors");
    expect(config.mcp.edukors).toMatchObject({ type: "remote", oauth: false });
    expect(config.mcp.edukors.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(config.mcp.edukors.headers.Authorization).toMatch(/^Bearer [0-9a-f]{32}$/);
    expect(config.agent.edukors.permission).toEqual({ "*": "deny", "edukors_*": "allow" });
    expect(config.skills.paths).toEqual([join(agent.cwd, "plugin", "skills")]);
  });

  it("runs the editor's tools, asks before editing, and shows it all in the conversation", async () => {
    agent.send({ t: "send", id: "s1", text: "Adicione um passo", uuid: "u1" });
    await agent.waitForTurn(1);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course", "edit_course"]);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:mcp__edukors__edit_course"]);
    const prompt = given(agent, "last-prompt.json");
    expect(prompt.agent).toBe("edukors");
    expect(prompt.model).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-5-5" });
    expect(prompt.variant).toBeUndefined();
    expect(prompt.system).toContain("Fale sempre em português.");
    expect(prompt.system).toContain("`ask_user`");
    expect(prompt.system).toContain("Scope: the course on screen");
    const t = fold(agent.events(sid));
    // The tool cards are the bridge's, not OpenCode's own report of them; the skill is OpenCode's.
    expect(t.items.map((i) => i.kind)).toEqual(["thinking", "tool", "tool", "tool", "text"]);
    expect(t.items[1]).toMatchObject({ name: "mcp__edukors__read_course", status: "done", result: "6 nodes, 5 edges" });
    expect(t.items[3]).toMatchObject({ name: "Skill", status: "done" });
    expect((t.items[4] as { text: string }).text).toContain("Pronto.");
  }, 60_000);

  it("refuses an edit while planning, and sends the effort as the model's variant", async () => {
    await agent.request("set", { mode: "plan", effort: "max" });
    agent.editorCalls.length = 0;
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s2", text: "Adicione outro passo", uuid: "u2" });
    await agent.waitForTurn(2);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course"]);
    expect(agent.asked).toHaveLength(0);
    const prompt = given(agent, "last-prompt.json");
    expect(prompt.system).toContain("Plan mode is on");
    expect(prompt.variant).toBe("max");
    const text = fold(agent.events(sid)).items.filter((i) => i.kind === "text").at(-1) as { text: string };
    expect(text.text).toContain("Plan mode is on");
    await agent.request("set", { mode: "ask", effort: "auto" });
  }, 60_000);

  it("says why Zen's free models do not answer", async () => {
    agent.send({ t: "send", id: "s3", text: "use o modelo grátis", uuid: "u3" });
    const end = await agent.waitForTurn(3);
    expect(end.ev).toMatchObject({ status: "error", code: "opencode_free_tier" });
  }, 60_000);

  it("lists this workspace's sessions only, and reads one back", async () => {
    const list: any = await agent.request("list", { provider: "opencode" });
    expect(list).toEqual([{ id: "ses_0001", title: "Conversa de teste", lastModified: 1790000000000 }]);
    const history: AgentEvent[] = (await agent.request("history", { provider: "opencode", sessionId: sid })) as AgentEvent[];
    const t = fold(history);
    expect(t.items.filter((i) => i.kind === "user")).toHaveLength(3);
    expect(t.items.some((i) => i.kind === "tool" && i.name === "mcp__edukors__edit_course")).toBe(true);
    expect(t.items.at(-1)).toMatchObject({ kind: "notice", code: "opencode_free_tier" });
  }, 60_000);

  it("interrupts a turn, and deletes a session", async () => {
    agent.send({ t: "send", id: "s4", text: "devagar, adicione mais um passo", uuid: "u4" });
    await new Promise((r) => setTimeout(r, 300));
    await agent.request("interrupt");
    const end = await agent.waitForTurn(4);
    expect(end.ev.status).toBe("interrupted");
    await agent.request("delete", { provider: "opencode", sessionId: sid });
    expect(await agent.request("list", { provider: "opencode" })).toEqual([]);
  }, 60_000);
});

describe("OpenCode with no provider connected", () => {
  it("opens no session, and says so, so the panel can offer the sign-in", async () => {
    const other = await startSidecar({ EDUKORS_OPENCODE: FAKE, FAKE_OPENCODE_SIGNED_OUT: "1" });
    try {
      const opened: any = await other.request("open", { provider: "opencode", model: "default", mode: "ask", effort: "auto", instructions: "", mcp: {} });
      expect(opened.account).toEqual({ provider: "opencode", signedIn: false });
      expect(opened.sessionId).toBe("");
      expect(opened.models).toEqual([]);
    } finally {
      await other.stop();
    }
  }, 60_000);
});

describe("OpenCode with the person's own MCP servers", () => {
  it("is given them through the bridge, behind the editor's gate", async () => {
    const other = await startSidecar({ EDUKORS_OPENCODE: FAKE });
    try {
      const mcp = { materiais: { command: process.execPath, args: [join(root, "tests", "fake-mcp-server.mjs")] } };
      const opened: any = await other.request("open", { provider: "opencode", model: "default", mode: "ask", effort: "auto", instructions: "", mcp });
      expect(opened.mcp).toEqual([{ name: "materiais", status: "connected" }]);
      const { config } = given(other, "last-config.json");
      expect(config.mcp.materiais.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\/materiais$/);
      expect(config.agent.edukors.permission).toEqual({ "*": "deny", "edukors_*": "allow", "materiais_*": "allow" });
      other.send({ t: "send", id: "m1", text: "Use os materiais", uuid: "u1" });
      await other.waitForTurn(1);
      expect(other.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:mcp__materiais__echo"]);
      const cards = fold(other.events(opened.sessionId)).items.filter((i) => i.kind === "tool");
      // One card, the bridge's: OpenCode's own report of the call is not a second.
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ name: "mcp__materiais__echo", result: "eco: oi" });
    } finally {
      await other.stop();
    }
  }, 60_000);
});
