/**
 * OpenCode's server: its stream of events as the conversation on screen, a
 * session read back, the models it offers (agent/providers/opencodeEvents.mjs).
 *
 * The fixtures in tests/fixtures/opencode/ are real output of `opencode serve`
 * 1.19, with a model that read the course through the editor's bridge: the
 * events of the session (tool-turn.ndjson, from GET /event) and the session
 * read back afterwards (history.json, from GET /session/:id/message).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- the agent's process is plain JavaScript, checked by JSDoc
import { createMapper, errorEnd, historyEvents, parseModels, titleOf, usableProviders } from "../agent/providers/opencodeEvents.mjs";
import { applyEvent, emptyTranscript, fold, type Transcript } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", "opencode", name), "utf8");
const events = () =>
  fixture("tool-turn.ndjson")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

const ownsTool = (name: string) => name.startsWith("edukors_");
const play = (stream: any[], inTurn = true) => {
  const mapper = createMapper({ ownsTool });
  if (inTurn) mapper.begin();
  const out: AgentEvent[] = stream.flatMap((e) => mapper.map(e) as AgentEvent[]);
  return { mapper, out, transcript: out.reduce((t: Transcript, ev) => applyEvent(t, ev), emptyTranscript()) };
};

describe("OpenCode's stream, as the panel's events", () => {
  it("shows the thought and the answer as they are written, and ends the turn once", () => {
    const { out, transcript } = play(events());
    expect(out.filter((e) => e.ev === "turn_end")).toEqual([{ ev: "turn_end", status: "success" }]);
    expect(out.filter((e) => e.ev === "block_delta").map((e) => (e as { text: string }).text)).toEqual(["Vou ler o curso.", "Pronto. ", "O curso tem 6 nós."]);
    const items = fold(out).items;
    expect(items.map((i) => i.kind)).toEqual(["thinking", "text"]);
    expect((items[1] as { text: string }).text).toBe("Pronto. O curso tem 6 nós.");
    expect(transcript.live).toBeNull();
  });

  it("leaves the person's own message and the editor's tools out: the panel and the bridge show those", () => {
    const { out } = play(events());
    const shown = JSON.stringify(out);
    expect(shown).not.toContain("leia o curso");
    expect(shown).not.toContain("edukors_read_course");
  });

  it("shows OpenCode's own tools, under the names the cards know", () => {
    const part = (state: any) => ({ type: "message.part.updated", properties: { sessionID: "s", part: { id: "p1", messageID: "m1", type: "tool", tool: "skill", callID: "c1", state } } });
    const { out } = play([
      { type: "message.updated", properties: { sessionID: "s", info: { id: "m1", role: "assistant" } } },
      part({ status: "running", input: { name: "estilo" } }),
      part({ status: "completed", input: { name: "estilo" }, output: "Frases curtas." }),
      part({ status: "completed", input: { name: "estilo" }, output: "Frases curtas." }),
    ]);
    expect(out).toEqual([
      { ev: "assistant", uuid: "c1", blocks: [{ type: "tool_use", index: 0, id: "c1", name: "Skill", input: { name: "estilo", skill: "estilo" } }] },
      { ev: "tool_result", toolUseId: "c1", text: "Frases curtas." },
    ]);
  });

  it("ends a turn as interrupted, or with the error and what it means", () => {
    const failed = (error: any) => [
      { type: "session.error", properties: { sessionID: "s", error } },
      { type: "session.status", properties: { sessionID: "s", status: { type: "idle" } } },
      { type: "session.idle", properties: { sessionID: "s" } },
    ];
    expect(play(failed({ name: "MessageAbortedError", data: { message: "aborted" } })).out).toEqual([{ ev: "turn_end", status: "interrupted" }]);
    const free = play(failed({ name: "APIError", data: { message: "OpenCode's free tier can only be used from within OpenCode.", responseBody: '{"error":{"type":"FreeTierError"}}' } })).out;
    expect(free).toEqual([{ ev: "turn_end", status: "error", code: "opencode_free_tier", text: "OpenCode's free tier can only be used from within OpenCode." }]);
    expect(errorEnd({ name: "ProviderAuthError", data: { message: "no key" } })).toMatchObject({ code: "opencode_auth" });
    expect(errorEnd({ name: "UnknownError", data: { message: "boom" } })).toEqual({ ev: "turn_end", status: "error", code: "opencode_error", text: "boom" });
  });

  it("says nothing of a session going idle outside a turn", () => {
    expect(play([{ type: "session.idle", properties: { sessionID: "s" } }], false).out).toEqual([]);
  });
});

describe("an OpenCode session read back", () => {
  it("is the same conversation, with the editor's tools under the bridge's names", () => {
    const qualify = (tool: string) => (tool.startsWith("edukors_") ? `mcp__edukors__${tool.slice("edukors_".length)}` : null);
    const items = fold(historyEvents(JSON.parse(fixture("history.json")), { qualify })).items;
    expect(items.map((i) => i.kind)).toEqual(["user", "thinking", "tool", "text"]);
    expect(items[0]).toMatchObject({ text: "leia o curso" });
    expect(items[2]).toMatchObject({ name: "mcp__edukors__read_course", status: "done" });
    expect((items[3] as { text: string }).text).toBe("Pronto. O curso tem 6 nós.");
  });
});

describe("OpenCode's providers and models", () => {
  const zen = { id: "opencode", name: "OpenCode Zen", options: { apiKey: "public" }, models: { "big-pickle": { id: "big-pickle", name: "Big Pickle" } } };
  const anthropic = {
    id: "anthropic",
    name: "Anthropic",
    options: {},
    models: {
      "claude-sonnet-5-5": { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", variants: { high: {}, max: {}, minimal: {} } },
      old: { id: "old", name: "Old", status: "deprecated" },
    },
  };
  const openai = { id: "openai", name: "OpenAI", options: {}, models: { "gpt-6": { id: "gpt-6", name: "GPT-6" } } };

  it("counts no account in Zen's free models alone", () => {
    expect(usableProviders({ providers: [zen] })).toEqual([]);
    expect(parseModels({ providers: [zen], default: { opencode: "big-pickle" } })).toEqual([]);
    // With a key of the person's own, Zen is an account like any other.
    expect(usableProviders({ providers: [{ ...zen, options: { apiKey: "sk-zen" } }] })).toHaveLength(1);
  });

  it("offers each model as provider/model, with its efforts, and the default the person or OpenCode would pick", () => {
    const models = parseModels({ providers: [zen, anthropic], default: { opencode: "big-pickle", anthropic: "claude-sonnet-5-5" } });
    expect(models).toEqual([
      { value: "default", displayName: "Claude Sonnet 5.5", resolved: "anthropic/claude-sonnet-5-5", efforts: ["high", "max"] },
      { value: "anthropic/claude-sonnet-5-5", displayName: "Claude Sonnet 5.5", efforts: ["high", "max"] },
    ]);
    const two = parseModels({ providers: [anthropic, openai], default: { anthropic: "claude-sonnet-5-5" } }, "openai/gpt-6");
    expect(two[0]).toMatchObject({ value: "default", displayName: "OpenAI · GPT-6", resolved: "openai/gpt-6" });
    expect(two.map((m: { value: string }) => m.value)).toEqual(["default", "anthropic/claude-sonnet-5-5", "openai/gpt-6"]);
  });

  it("keeps a title OpenCode gave, not the date it starts with", () => {
    expect(titleOf({ title: "New session - 2026-10-14T11:10:18.000Z" })).toBe("");
    expect(titleOf({ title: "Quiz sobre gatos" })).toBe("Quiz sobre gatos");
  });
});
