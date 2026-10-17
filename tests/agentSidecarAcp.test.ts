/**
 * The agent's process with Kiro or Kimi behind it, both through the Agent
 * Client Protocol: the panel's requests, the tools the editor runs, the cards
 * the person answers, and the conversations the editor keeps for them.
 *
 * Neither CLI is installed on a machine that only builds the app, so a
 * stand-in plays them (tests/fake-acp.mjs): it speaks the same JSON-RPC, asks
 * the editor before using a tool of its own, and reaches the editor's tools
 * through the MCP server the editor gave it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSidecar, root, type Sidecar } from "./sidecarHarness";
import { fold } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

const FAKE = join(root, "tests", "fake-acp.mjs");
const seen = (agent: Sidecar, id: string) => JSON.parse(readFileSync(join(agent.cwd, id, "workspace", "fake-acp.json"), "utf8"));

describe("the agent's process, on Kimi", () => {
  let agent: Sidecar;
  let theirs: string;
  let sid = "";

  beforeAll(async () => {
    // The person's own Kimi home: a provider, and settings the editor sets itself.
    theirs = mkdtempSync(join(tmpdir(), "edukors-kimi-home-"));
    writeFileSync(
      join(theirs, "config.toml"),
      [
        'default_model = "kimi-code/k3"',
        'default_permission_mode = "yolo"',
        'extra_skill_dirs = [',
        '  "~/elsewhere",',
        "]",
        "",
        '[providers."managed:kimi-code"]',
        'type = "kimi"',
        "",
        "[[permission.rules]]",
        'decision = "allow"',
        'pattern = "Bash"',
        "",
        "[[hooks]]",
        'event = "PreToolUse"',
        'command = "node hook.mjs"',
        "",
        '[models."kimi-code/k3"]',
        'provider = "managed:kimi-code"',
        "",
      ].join("\n"),
    );
    agent = await startSidecar({ EDUKORS_KIMI: FAKE, FAKE_ACP: "kimi", EDUKORS_KIMI_HOME: theirs });
  }, 60_000);

  afterAll(async () => {
    await agent.stop();
    rmSync(theirs, { recursive: true, force: true });
  });

  it("finds the CLI and opens a session with the models and efforts it offers", async () => {
    const ready = agent.lines.find((m) => m.t === "ready");
    expect(ready.providers.find((p: any) => p.id === "kimi")).toMatchObject({ available: true, version: "2.2.0" });
    const opened: any = await agent.request("open", { provider: "kimi", model: "default", mode: "ask", effort: "max", instructions: "Fale sempre em português.", mcp: {} });
    sid = opened.sessionId;
    expect(sid).toBeTruthy();
    expect(opened.account).toMatchObject({ provider: "kimi", signedIn: true });
    expect(opened.capabilities).toMatchObject({ efforts: true, usage: false, bash: true, skills: true, mcp: true, ownQuestions: false });
    expect(opened.models.map((m: any) => m.value)).toEqual(["default", "k3", "kimi-for-coding"]);
    expect(opened.models[0]).toMatchObject({ displayName: "K3", resolved: "k3", efforts: ["low", "high", "max"] });
    // The effort the panel had is set on the session as it opens.
    expect(seen(agent, "kimi").config).toEqual([{ sessionId: "sess_1", configId: "effort", value: "max" }]);
  }, 60_000);

  it("gives Kimi a home of its own: the editor's prompt, the person's providers, the editor's rules", () => {
    const s = seen(agent, "kimi");
    expect(s.args).toEqual(["acp"]);
    expect(s.system).toContain("Fale sempre em português.");
    expect(s.system).toContain("Scope: the course on screen");
    expect(s.system).toContain("${skills_section}");
    expect(s.toml).toContain('default_permission_mode = "manual"');
    expect(s.toml).toContain('[providers."managed:kimi-code"]');
    expect(s.toml).toContain('[models."kimi-code/k3"]');
    expect(s.toml).toContain(`extra_skill_dirs = [${JSON.stringify(join(agent.cwd, "plugin", "skills"))}]`);
    // What the person set that the editor sets itself, or that would run something, is left out.
    expect(s.toml).not.toContain("yolo");
    expect(s.toml).not.toContain("elsewhere");
    expect(s.toml).not.toContain("permission.rules");
    expect(s.toml).not.toContain("hook.mjs");
    expect(s.toml).toMatch(/\[tools\]\ndisabled = \[.*"Write".*"Edit".*"AskUserQuestion".*\]/);
    // The editor's server goes with each session, with the bridge's token.
    const server = s.sessions[0].mcpServers[0];
    expect(server).toMatchObject({ type: "http", name: "edukors" });
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(server.headers[0].value).toMatch(/^Bearer \w+$/);
  });

  it("runs the editor's tools, asks before editing, and shows it all in the conversation", async () => {
    agent.send({ t: "send", id: "s1", text: "Adicione um passo", uuid: "u1" });
    await agent.waitForTurn(1);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course", "edit_course"]);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:mcp__edukors__edit_course"]);
    const t = fold(agent.events(sid));
    // The tool cards are the bridge's, not Kimi's own report of them.
    expect(t.items.map((i) => i.kind)).toEqual(["thinking", "tool", "tool", "text"]);
    expect(t.items[1]).toMatchObject({ name: "mcp__edukors__read_course", status: "done", result: "6 nodes, 5 edges" });
    expect((t.items[3] as { text: string }).text).toContain("Pronto.");
  }, 60_000);

  it("puts a command to the person, with the input the CLI announced, and tells Kimi what they said", async () => {
    agent.editorCalls.length = 0;
    agent.asked.length = 0;
    agent.answers.permission = () => ({ behavior: "deny", message: "não agora" });
    agent.send({ t: "send", id: "s2", text: "rode um comando", uuid: "u2" });
    await agent.waitForTurn(2);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:Bash"]);
    expect(agent.asked[0].input.command).toBe("ls samples");
    expect(agent.asked[0].once).toBe(true);
    const t = fold(agent.events(sid));
    expect(t.items.at(-1)).toMatchObject({ kind: "text", text: "Não rodei o comando." });
    expect(t.items.some((i) => i.kind === "tool" && i.name === "Bash" && i.status === "error")).toBe(true);
    agent.answers.permission = () => ({ behavior: "allow" });
  }, 60_000);

  it("refuses to write a file, without troubling the person", async () => {
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s3", text: "crie um arquivo", uuid: "u3" });
    await agent.waitForTurn(3);
    expect(agent.asked).toHaveLength(0);
    const events = agent.events(sid);
    expect(events.some((e) => e.ev === "notice" && e.code === "acp_file_change")).toBe(true);
    expect(fold(events).items.at(-1)).toMatchObject({ kind: "text", text: "Não escrevi o arquivo." });
  }, 60_000);

  it("sends the plan instructions with the message while planning, and refuses an edit", async () => {
    await agent.request("set", { mode: "plan" });
    agent.editorCalls.length = 0;
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s4", text: "Adicione outro passo", uuid: "u4" });
    await agent.waitForTurn(4);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course"]);
    expect(agent.asked).toHaveLength(0);
    const text = fold(agent.events(sid)).items.filter((i) => i.kind === "text").at(-1) as { text: string };
    expect(text.text).toContain("Plan mode is on");
    await agent.request("set", { mode: "ask" });
  }, 60_000);

  it("changes the model on the session, and interrupts a turn", async () => {
    await agent.request("set", { model: "kimi-for-coding" });
    expect(seen(agent, "kimi").config.at(-1)).toEqual({ sessionId: "sess_1", configId: "model", value: "kimi-for-coding" });
    agent.send({ t: "send", id: "s5", text: "devagar, adicione mais um passo", uuid: "u5" });
    await new Promise((r) => setTimeout(r, 300));
    await agent.request("interrupt");
    const end = await agent.waitForTurn(5);
    expect(end.ev.status).toBe("interrupted");
  }, 60_000);

  it("lists the conversation, reads it back, and resumes it on the same session", async () => {
    const list: any = await agent.request("list", { provider: "kimi" });
    expect(list[0]).toMatchObject({ id: sid, firstPrompt: "Adicione um passo" });
    const history = (await agent.request("history", { provider: "kimi", sessionId: sid })) as AgentEvent[];
    expect(fold(history).items.filter((i) => i.kind === "user")).toHaveLength(5);
    const opened: any = await agent.request("open", { provider: "kimi", resume: sid, model: "default", mode: "ask", effort: "auto", instructions: "Fale sempre em português.", mcp: {} });
    expect(opened).toMatchObject({ sessionId: sid, resumed: true });
    expect(seen(agent, "kimi").sessions.at(-1)).toEqual({ resume: "sess_1" });
    await agent.request("delete", { provider: "kimi", sessionId: sid });
    expect(seen(agent, "kimi").sessions.at(-1)).toEqual({ delete: "sess_1" });
    expect(await agent.request("list", { provider: "kimi" })).toEqual([]);
  }, 60_000);
});

describe("Kimi with nobody signed in", () => {
  it("opens no session, and says so, so the panel can offer the sign-in", async () => {
    const other = await startSidecar({ EDUKORS_KIMI: FAKE, FAKE_ACP: "kimi", FAKE_ACP_SIGNED_OUT: "1", EDUKORS_KIMI_HOME: join(tmpdir(), "edukors-no-kimi-home") });
    try {
      const opened: any = await other.request("open", { provider: "kimi", model: "default", mode: "ask", effort: "auto", instructions: "", mcp: {} });
      expect(opened.account).toEqual({ provider: "kimi", signedIn: false });
      expect(opened.sessionId).toBe("");
    } finally {
      await other.stop();
    }
  }, 60_000);
});

describe("the agent's process, on Kiro", () => {
  let agent: Sidecar;
  let sid = "";

  beforeAll(async () => {
    agent = await startSidecar({ EDUKORS_KIRO: FAKE, FAKE_ACP: "kiro" });
  }, 60_000);

  afterAll(() => agent.stop());

  it("opens a session as the editor's agent, with the account the CLI is signed in with", async () => {
    const ready = agent.lines.find((m) => m.t === "ready");
    expect(ready.providers.find((p: any) => p.id === "kiro")).toMatchObject({ available: true, version: "2.32.0" });
    const opened: any = await agent.request("open", { provider: "kiro", model: "claude-sonnet-5", mode: "ask", effort: "auto", instructions: "Fale sempre em português.", mcp: {} });
    sid = opened.sessionId;
    expect(opened.account).toEqual({ provider: "kiro", signedIn: true, email: "professora@exemplo.org", plan: "free" });
    expect(opened.capabilities).toMatchObject({ bash: false, skills: true, mcp: true });
    expect(opened.models.map((m: any) => m.value)).toEqual(["default", "auto", "claude-sonnet-5"]);
    // Kiro takes the model by the older method, without configuration options.
    expect(seen(agent, "kiro").config).toEqual([{ sessionId: "sess_1", modelId: "claude-sonnet-5" }]);
  }, 60_000);

  it("writes the agent Kiro runs as: the editor's prompt, the bridge, reading, and the editor's skills", () => {
    const s = seen(agent, "kiro");
    expect(s.args).toEqual(["acp", "--agent", "edukors"]);
    expect(s.sessions[0].mcpServers).toEqual([]);
    expect(s.agent.prompt).toContain("Fale sempre em português.");
    expect(s.agent.tools).toEqual(["@edukors", "read"]);
    expect(s.agent.allowedTools).toEqual(["@edukors"]);
    expect(s.agent.includeMcpJson).toBe(false);
    expect(s.agent.resources).toEqual([`skill://${join(agent.cwd, "plugin", "skills")}/**/SKILL.md`]);
    // The token is not written down: Kiro reads it from its environment.
    expect(s.agent.mcpServers.edukors).toMatchObject({ type: "http", headers: { Authorization: "Bearer ${EDUKORS_MCP_TOKEN}" } });
  });

  it("runs the editor's tools through the bridge, with one card each", async () => {
    agent.send({ t: "send", id: "k1", text: "Adicione um passo", uuid: "u1" });
    await agent.waitForTurn(1);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course", "edit_course"]);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:mcp__edukors__edit_course"]);
    const t = fold(agent.events(sid));
    expect(t.items.filter((i) => i.kind === "tool")).toHaveLength(2);
  }, 60_000);
});

describe("Kiro with nobody signed in", () => {
  it("does not start the CLI, and says so, so the panel can offer the sign-in", async () => {
    const other = await startSidecar({ EDUKORS_KIRO: FAKE, FAKE_ACP: "kiro", FAKE_ACP_SIGNED_OUT: "1" });
    try {
      const opened: any = await other.request("open", { provider: "kiro", model: "default", mode: "ask", effort: "auto", instructions: "", mcp: {} });
      expect(opened.account).toEqual({ provider: "kiro", signedIn: false });
      expect(opened.sessionId).toBe("");
    } finally {
      await other.stop();
    }
  }, 60_000);
});
