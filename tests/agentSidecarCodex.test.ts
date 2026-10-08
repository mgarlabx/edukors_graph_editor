/**
 * The agent's process with Codex behind it, the same way round as the
 * Antigravity one: the panel's requests, the tools the editor runs, the cards
 * the person answers, and the threads Codex keeps.
 *
 * OpenAI's CLI is not installed on a machine that only builds the app, so a
 * stand-in plays its app server (tests/fake-codex.mjs): it speaks the same
 * JSON-RPC, asks the editor before running a command, and reaches the editor's
 * tools through the MCP server written in its config.toml.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startSidecar, root, type Sidecar } from "./sidecarHarness";
import { fold } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

let agent: Sidecar;

beforeAll(async () => {
  agent = await startSidecar({ EDUKORS_CODEX: join(root, "tests", "fake-codex.mjs") });
}, 60_000);

afterAll(() => agent.stop());

describe("the agent's process, on Codex", () => {
  let sid = "";

  it("finds the CLI and opens a thread with the account and the models it reports", async () => {
    const ready = agent.lines.find((m) => m.t === "ready");
    expect(ready.providers.find((p: any) => p.id === "codex")).toMatchObject({ available: true, version: "0.161.0" });
    const opened: any = await agent.request("open", { provider: "codex", model: "default", mode: "ask", effort: "auto", instructions: "Fale sempre em português.", mcp: {} });
    sid = opened.sessionId;
    expect(sid).toBe("thr_fake");
    expect(opened.account).toMatchObject({ provider: "codex", signedIn: true, email: "professora@exemplo.org", plan: "pro" });
    expect(opened.capabilities).toMatchObject({ efforts: true, usage: false, bash: true, skills: false, ownQuestions: false });
    // The hidden model stays hidden, and the default stands for the one Codex recommends.
    expect(opened.models.map((m: any) => m.value)).toEqual(["default", "gpt-6.1-sol", "gpt-6.1-mini"]);
    expect(opened.models[0]).toMatchObject({ displayName: "GPT-6.1 Sol", resolved: "gpt-6.1-sol" });
    expect(opened.models[1].efforts).toEqual(["low", "medium", "high"]);
  }, 60_000);

  it("gives Codex a home of its own, with the editor's prompt and one MCP server", () => {
    const config = readFileSync(join(agent.cwd, "codex", "config.toml"), "utf8");
    expect(config).toContain('sandbox_mode = "read-only"');
    expect(config).toMatch(/\[mcp_servers\.edukors\]\nurl = "http:\/\/127\.0\.0\.1:\d+\/mcp"/);
    expect(config).toContain('bearer_token_env_var = "EDUKORS_MCP_TOKEN"');
    const thread = JSON.parse(readFileSync(join(agent.cwd, "codex", "last-thread.json"), "utf8"));
    expect(thread.sandboxPolicy).toEqual({ type: "readOnly" });
    expect(thread.approvalPolicy).toBe("untrusted");
    expect(thread.baseInstructions).toContain("Fale sempre em português.");
    expect(thread.baseInstructions).toContain("`ask_user`");
    expect(thread.baseInstructions).toContain("Scope: the course on screen");
  });

  it("runs the editor's tools, asks before editing, and shows it all in the conversation", async () => {
    agent.send({ t: "send", id: "s1", text: "Adicione um passo", uuid: "u1" });
    await agent.waitForTurn(1);
    expect(agent.editorCalls.map((c) => c.name)).toEqual(["read_course", "edit_course"]);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:mcp__edukors__edit_course"]);
    const t = fold(agent.events(sid));
    // The tool cards are the bridge's, not Codex's own report of them.
    expect(t.items.map((i) => i.kind)).toEqual(["tool", "tool", "text"]);
    expect(t.items[0]).toMatchObject({ name: "mcp__edukors__read_course", status: "done", result: "6 nodes, 5 edges" });
    expect((t.items[2] as { text: string }).text).toContain("Pronto.");
  }, 60_000);

  it("puts a command to the person, and tells Codex what they said", async () => {
    agent.editorCalls.length = 0;
    agent.asked.length = 0;
    agent.answers.permission = () => ({ behavior: "deny", message: "não agora" });
    agent.send({ t: "send", id: "s2", text: "rode um comando", uuid: "u2" });
    await agent.waitForTurn(2);
    expect(agent.asked.map((a) => `${a.kind}:${a.tool}`)).toEqual(["permission:Bash"]);
    expect(agent.asked[0].input.command).toBe("bash -lc ls samples");
    expect(agent.asked[0].once).toBe(true);
    const t = fold(agent.events(sid));
    expect(t.items.at(-1)).toMatchObject({ kind: "text", text: "Não rodei o comando." });
    expect(t.items.some((i) => i.kind === "tool" && i.name === "Bash" && i.status === "error")).toBe(true);
    agent.answers.permission = () => ({ behavior: "allow" });
  }, 60_000);

  it("puts Codex's own question to the person and answers it in order", async () => {
    agent.asked.length = 0;
    agent.send({ t: "send", id: "s3", text: "pergunte o ano", uuid: "u3" });
    await agent.waitForTurn(3);
    expect(agent.asked.map((a) => a.kind)).toEqual(["question"]);
    expect(agent.asked[0].input.questions[0]).toMatchObject({ question: "Para qual ano?", header: "Ano" });
    expect(agent.asked[0].input.questions[0].options).toEqual([{ label: "6º ano" }, { label: "9º ano" }]);
    const t = fold(agent.events(sid));
    expect((t.items.at(-1) as { text: string }).text).toContain("6º ano");
  }, 60_000);

  it("refuses an edit while planning, without troubling the person", async () => {
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

  it("lists Codex's own threads and reads one back", async () => {
    const list: any = await agent.request("list", { provider: "codex" });
    expect(list[0]).toMatchObject({ id: "thr_fake", title: "Conversa de teste", firstPrompt: "Adicione um passo" });
    expect(list[0].lastModified).toBe(1790000000000);
    const history: AgentEvent[] = (await agent.request("history", { provider: "codex", sessionId: "thr_fake" })) as AgentEvent[];
    const t = fold(history);
    expect(t.items.filter((i) => i.kind === "user")).toHaveLength(4);
    // The editor's own tool calls are not repeated from Codex's side.
    expect(t.items.filter((i) => i.kind === "tool" && i.name.startsWith("mcp__edukors__"))).toHaveLength(0);
    expect(t.items.some((i) => i.kind === "tool" && i.name === "Bash")).toBe(true);
  }, 60_000);

  it("interrupts a turn, and opens the sign-in page in the browser", async () => {
    agent.send({ t: "send", id: "s5", text: "devagar, adicione mais um passo", uuid: "u5" });
    await new Promise((r) => setTimeout(r, 300));
    await agent.request("interrupt");
    const end = await agent.waitForTurn(5);
    expect(end.ev.status).toBe("interrupted");
    const login = await agent.request("login", { provider: "codex" });
    expect(login.url).toBe("https://auth.example/device");
    // Codex says when the person is through, and the panel starts over.
    const said = await agent.waitFor((m) => m.t === "login", "the sign-in to be reported");
    expect(said).toMatchObject({ provider: "codex", ok: true });
  }, 60_000);
});

describe("Codex with nobody signed in", () => {
  it("opens no thread, and says so, so the panel can offer the sign-in", async () => {
    const other = await startSidecar({ EDUKORS_CODEX: join(root, "tests", "fake-codex.mjs"), FAKE_CODEX_SIGNED_OUT: "1" });
    try {
      const opened: any = await other.request("open", { provider: "codex", model: "default", mode: "ask", effort: "auto", instructions: "", mcp: {} });
      expect(opened.account).toEqual({ provider: "codex", signedIn: false });
      expect(opened.sessionId).toBe("");
      expect(opened.models).toEqual([]);
    } finally {
      await other.stop();
    }
  }, 60_000);
});
