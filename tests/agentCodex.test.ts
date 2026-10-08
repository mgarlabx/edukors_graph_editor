/**
 * Codex's app server: the line it is spoken to on (agent/jsonRpc.mjs) and its
 * stream of items as the conversation on screen (agent/providers/codexEvents.mjs).
 *
 * The fixtures in tests/fixtures/codex/ follow the shapes the app server's
 * reference documents. To capture real ones, run `codex app-server` and keep
 * the lines it writes; `codex app-server generate-json-schema` prints the
 * exact shapes of the build installed.
 */
import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- the agent's process is plain JavaScript, checked by JSDoc
import { attach } from "../agent/jsonRpc.mjs";
// @ts-expect-error -- as above
import { answersFrom, createMapper, historyEvents, mapQuestions } from "../agent/providers/codexEvents.mjs";
import { applyEvent, emptyTranscript, fold, type Transcript } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", "codex", name), "utf8");
const lines = (name: string) =>
  fixture(name)
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

const ownsTool = (name: string) => name.startsWith("mcp__edukors__");
const play = (name: string) => {
  const mapper = createMapper({ ownsTool });
  const events: AgentEvent[] = lines(name).flatMap((m) => mapper.map(m.method, m.params) as AgentEvent[]);
  return { mapper, events, transcript: events.reduce((t: Transcript, ev) => applyEvent(t, ev), emptyTranscript()) };
};

/** A stand-in for the app server: what it reads, what it writes. */
function fakeServer() {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const child = Object.assign(new EventEmitter(), { stdout, stdin, exitCode: null as number | null, kill: () => true });
  const written: any[] = [];
  stdin.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) if (line.trim()) written.push(JSON.parse(line));
  });
  const say = (msg: unknown) => stdout.write(JSON.stringify(msg) + "\n");
  return { child: child as any, written, say };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe("the app server's line", () => {
  it("asks and gets an answer, by id, without the jsonrpc field", async () => {
    const server = fakeServer();
    const rpc = attach(server.child, {});
    const answer = rpc.request("account/read", { refreshToken: false });
    await settle();
    expect(server.written[0]).toEqual({ id: 1, method: "account/read", params: { refreshToken: false } });
    expect("jsonrpc" in server.written[0]).toBe(false);
    server.say({ id: 1, result: { type: "chatgpt", email: "a@b.c" } });
    expect(await answer).toEqual({ type: "chatgpt", email: "a@b.c" });
  });

  it("passes on an error as an error, and a notification to its handler", async () => {
    const server = fakeServer();
    const heard: [string, any][] = [];
    const rpc = attach(server.child, { onNotification: (m: string, p: any) => heard.push([m, p]) });
    const answer = rpc.request("thread/start", {});
    await settle();
    server.say({ id: 1, error: { code: -32000, message: "no account" } });
    await expect(answer).rejects.toThrow("no account");
    server.say({ method: "turn/started", params: { turn: { id: "t1" } } });
    await settle();
    expect(heard).toEqual([["turn/started", { turn: { id: "t1" } }]]);
  });

  it("answers what the server asks it, under the same id", async () => {
    const server = fakeServer();
    attach(server.child, { onRequest: async (method: string) => (method.endsWith("requestApproval") ? { decision: "accept" } : { answers: [] }) });
    server.say({ id: 7, method: "item/commandExecution/requestApproval", params: { command: ["ls"] } });
    await settle();
    expect(server.written.at(-1)).toEqual({ id: 7, result: { decision: "accept" } });
  });

  it("says so when the server has nothing for a request, and when it stops", async () => {
    const server = fakeServer();
    const rpc = attach(server.child, {});
    server.say({ id: 8, method: "unknown/thing", params: {} });
    await settle();
    expect(server.written.at(-1).error.message).toContain("unhandled request");
    const answer = rpc.request("thread/list", {});
    server.child.emit("exit", 1, null);
    await expect(answer).rejects.toThrow("stopped");
  });
});

describe("codex stream", () => {
  it("shows a thought and an answer, each settled into one item", () => {
    const { transcript } = play("text-turn.ndjson");
    expect(transcript.live).toBeNull();
    expect(transcript.items).toEqual([
      { kind: "thinking", key: "item_1:0", text: "Lendo o curso." },
      { kind: "text", key: "item_2:0", text: "O curso tem seis passos." },
    ]);
  });

  it("leaves the editor's own tools to the bridge and shows a command with its output", () => {
    const { transcript } = play("tools-turn.ndjson");
    expect(transcript.items.map((i) => i.kind)).toEqual(["tool", "notice"]);
    expect(transcript.items[0]).toMatchObject({ kind: "tool", name: "Bash", status: "error", input: { command: "bash -lc ls samples" } });
    // A change to a file is refused, and said so.
    expect(transcript.items[1]).toMatchObject({ kind: "notice", code: "codex_file_change" });
  });

  it("reports a turn that failed with the server's words", () => {
    const { events } = play("failed.ndjson");
    expect(events.at(-1)).toEqual({ ev: "turn_end", status: "error", code: "codex_failed", text: "model not available for this account" });
  });

  it("keeps the turn's id, to interrupt it", () => {
    const { mapper } = play("text-turn.ndjson");
    const fresh = createMapper({ ownsTool });
    fresh.map("turn/started", { turn: { id: "turn_9" } });
    expect(fresh.turnId).toBe("turn_9");
    // A finished turn has none.
    expect(mapper.turnId).toBeNull();
  });

  it("reads a thread back as the conversation it was", () => {
    const thread = JSON.parse(fixture("thread.json")).thread;
    const t = fold(historyEvents(thread, { ownsTool }) as AgentEvent[]);
    expect(t.items.map((i) => i.kind)).toEqual(["user", "tool", "text"]);
    expect(t.items[0]).toEqual({ kind: "user", key: "u1", text: "Revise o quiz", context: "q1 · Quiz" });
    expect(t.items[1]).toMatchObject({ name: "Bash", status: "done", result: "ok" });
  });

  it("turns Codex's questions into the panel's card and the answers back under their ids", () => {
    const params = {
      questions: [
        { id: "q1", header: "Ano", question: "Para qual ano?", options: [{ label: "6º ano", description: "11–12" }, { label: "9º ano" }] },
        { id: "q2", header: "Passos", question: "Quantos passos?" },
      ],
    };
    const input = mapQuestions(params);
    expect(input.questions[0]).toEqual({ question: "Para qual ano?", header: "Ano", options: [{ label: "6º ano", description: "11–12" }, { label: "9º ano" }] });
    expect(input.questions[1]).toEqual({ question: "Quantos passos?", header: "Passos", options: [] });
    expect(answersFrom(params, { "Para qual ano?": "6º ano", "Quantos passos?": "seis" })).toEqual({
      answers: { q1: { answers: ["6º ano"] }, q2: { answers: ["seis"] } },
    });
    // A question nobody answered goes back empty, not missing.
    expect(answersFrom(params, {})).toEqual({ answers: { q1: { answers: [] }, q2: { answers: [] } } });
  });
});
