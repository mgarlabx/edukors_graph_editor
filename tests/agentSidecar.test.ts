/**
 * The agent's process as the app speaks to it, with the Antigravity CLI behind
 * it: the whole way round, from the panel's request to the tools the editor
 * runs and back.
 *
 * Google's CLI is not installed on a machine that only builds the app, so a
 * stand-in plays it (tests/fake-agy.mjs): it takes the flags the editor
 * passes, speaks the same stream-json protocol, and reaches the editor's tools
 * through the MCP server the editor wrote for it. What is tested is therefore
 * everything the editor owns -- the workspace it writes, the bridge, the gate,
 * the cards, the journal -- short of Google's own binary.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startSidecar, root, type Sidecar } from "./sidecarHarness";
import { fold } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

let agent: Sidecar;

beforeAll(async () => {
  agent = await startSidecar({ EDUKORS_AGY: join(root, "tests", "fake-agy.mjs") });
}, 60_000);

afterAll(() => agent.stop());

describe("the agent's process, with a CLI provider", () => {
  let sid = "";

  it("finds the CLI and says what it can run", async () => {
    const ready = agent.lines.find((m) => m.t === "ready");
    expect(ready.providers.find((p: any) => p.id === "antigravity")).toMatchObject({ available: true, version: "1.2.2" });
    expect(ready.providers.map((p: any) => p.id)).toEqual(["claude", "antigravity", "codex"]);
  });

  it("opens a conversation with the models and the account the CLI reports", async () => {
    const opened: any = await agent.request("open", { provider: "antigravity", model: "default", mode: "ask", effort: "auto", instructions: "Fale sempre em português.", mcp: {} });
    sid = opened.sessionId;
    expect(sid).toBeTruthy();
    expect(opened.provider).toBe("antigravity");
    expect(opened.capabilities).toMatchObject({ efforts: false, usage: false, mcp: false, ownQuestions: false });
    expect(opened.account).toMatchObject({ provider: "antigravity", signedIn: true });
    expect(opened.models.map((m: any) => m.value)).toContain("gemini-3.8-flash-high");
  }, 60_000);

  it("writes the CLI a workspace with the editor's prompt, its tools and the person's instructions", () => {
    const prompt = readFileSync(join(agent.cwd, "antigravity", ".agents", "agents", "edukors", "agent.md"), "utf8");
    expect(prompt).toContain("tools: []");
    expect(prompt).toContain("Fale sempre em português.");
    // The question and plan tools are the editor's, since this provider has none.
    expect(prompt).toContain("`ask_user`");
    expect(prompt).toContain("Scope: the course on screen");
    // No shell in this session, and so it is told.
    expect(prompt).toContain("no shell and no file tools");
    const config = JSON.parse(readFileSync(join(agent.cwd, "antigravity", ".agents", "mcp_config.json"), "utf8"));
    expect(config.mcpServers.edukors.serverUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(config.mcpServers.edukors.headers.Authorization).toMatch(/^Bearer \w+$/);
  });

  it("runs the editor's tools, asks before editing, and shows it all in the conversation", async () => {
    agent.send({ t: "send", id: "s1", text: "<editor-context>\nCourse on screen: \"Gatos\"\nMode: ask.\n</editor-context>\n\nAdicione um passo", uuid: "u1" });
    await agent.waitForTurn(1);
    // Reading passed on its own; editing waited for the person.
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course", "edit_course"]);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:mcp__edukors__edit_course"]);
    expect(agent.asked[0].input.summary).toContain("sim/não");
    const kinds = agent.events(sid).map((e) => e.ev);
    expect(kinds).toContain("block_delta");
    expect(kinds.at(-1)).toBe("turn_end");
    const t = fold(agent.events(sid));
    // Two tool cards with their results, and the answer. The CLI's own wrapper
    // for calling an MCP server is not a third card: the bridge's is the card.
    expect(t.items.map((i) => i.kind)).toEqual(["tool", "tool", "text"]);
    expect(t.items.some((i) => i.kind === "tool" && i.name === "call_mcp_tool")).toBe(false);
    expect(t.items[0]).toMatchObject({ name: "mcp__edukors__read_course", status: "done", result: "6 nodes, 5 edges" });
    expect(t.items[1]).toMatchObject({ name: "mcp__edukors__edit_course", status: "done" });
    expect((t.items[2] as { text: string }).text).toContain("Pronto.");
  }, 60_000);

  it("refuses an edit while planning, and carries the refusal to the CLI", async () => {
    await agent.request("set", { mode: "plan" });
    agent.editorCalls.length = 0;
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s2", text: "Adicione outro passo", uuid: "u2" });
    await agent.waitForTurn(2);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course"]);
    expect(agent.asked).toHaveLength(0);
    const text = fold(agent.events(sid)).items.filter((i) => i.kind === "text").at(-1) as { text: string };
    expect(text.text).toContain("Plan mode is on");
    await agent.request("set", { mode: "ask" });
  }, 60_000);

  it("puts the CLI's question to the person and gives it the answer", async () => {
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s3", text: "pergunte o ano", uuid: "u3" });
    await agent.waitForTurn(3);
    expect(agent.asked.map((a) => a.kind)).toEqual(["question"]);
    const text = fold(agent.events(sid)).items.filter((i) => i.kind === "text").at(-1) as { text: string };
    expect(text.text).toContain("6º ano");
  }, 60_000);

  it("puts the plan to the person and goes on in the mode they approved", async () => {
    await agent.request("set", { mode: "plan" });
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s4", text: "planeje o curso", uuid: "u4" });
    await agent.waitForTurn(4);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["plan:plan_ready"]);
    expect(agent.asked[0].input.plan).toContain("Ler o curso");
    const text = fold(agent.events(sid)).items.filter((i) => i.kind === "text").at(-1) as { text: string };
    expect(text.text).toContain("Pode executar.");
    // The mode the person approved is the one the editor now works in.
    agent.editorCalls.length = 0;
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s5", text: "Adicione mais um passo", uuid: "u5" });
    await agent.waitForTurn(5);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course", "edit_course"]);
    expect(agent.asked.map((a) => a.kind)).toEqual(["permission"]);
  }, 60_000);

  it("keeps the conversation so the panel can list it and read it back", async () => {
    const list: any = await agent.request("list", { provider: "antigravity" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: sid });
    expect(list[0].firstPrompt).toContain("Adicione um passo");
    const history: AgentEvent[] = (await agent.request("history", { provider: "antigravity", sessionId: sid })) as AgentEvent[];
    const t = fold(history);
    expect(t.items.filter((i) => i.kind === "user")).toHaveLength(5);
    // The stream of an answer being written is not kept; the answer itself is.
    expect(history.some((e) => e.ev === "block_delta")).toBe(false);
    expect(t.items.filter((i) => i.kind === "text").length).toBeGreaterThan(2);
  }, 60_000);

  it("holds a message written while the CLI is still starting, instead of racing it", async () => {
    // The panel can send as soon as the person hits Enter, and starting a CLI
    // takes a moment: the message waits for the conversation it belongs to.
    const slow = await startSidecar({ EDUKORS_AGY: join(root, "tests", "fake-agy.mjs"), FAKE_AGY_SLOW: "1200" });
    try {
      const opened = slow.request("open", { provider: "antigravity", model: "default", mode: "ask", effort: "auto", instructions: "", mcp: {} });
      slow.send({ t: "send", id: "early", text: "Adicione um passo", uuid: "u1" });
      const result: any = await opened;
      const reply = await slow.waitFor((m) => m.t === "reply" && m.id === "early", "the message to be taken");
      expect(reply.ok).toBe(true);
      expect(reply.data.sessionId).toBe(result.sessionId);
      await slow.waitForTurn(1);
      expect(slow.editorCalls.map((c) => c.name)).toEqual(["read_course", "edit_course"]);
    } finally {
      await slow.stop();
    }
  }, 60_000);

  it("says plainly when the conversation went while the message was on its way", async () => {
    const slow = await startSidecar({ EDUKORS_AGY: join(root, "tests", "fake-agy.mjs"), FAKE_AGY_SLOW: "800" });
    try {
      await slow.request("open", { provider: "antigravity", model: "default", mode: "ask", effort: "auto", instructions: "", mcp: {} });
      // The CLI is stopped, so the next message has to start it again; the
      // conversation is closed while it does.
      await slow.request("interrupt");
      const sending = slow.request("send", { text: "Adicione um passo", uuid: "u2" });
      await new Promise((r) => setTimeout(r, 100));
      await slow.request("close");
      await expect(sending).rejects.toThrow(/closed|conversation/i);
    } finally {
      await slow.stop();
    }
  }, 60_000);

  it("closes the CLI with the conversation, and forgets a conversation the person deletes", async () => {
    await agent.request("close");
    await agent.request("delete", { provider: "antigravity", sessionId: sid });
    expect(await agent.request("list", { provider: "antigravity" })).toEqual([]);
    expect(existsSync(join(agent.cwd, "antigravity", "transcripts", `${sid}.ndjson`))).toBe(false);
  }, 60_000);
});
