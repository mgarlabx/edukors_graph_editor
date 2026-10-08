/**
 * Claude's messages, as the panel's events and then as the conversation on
 * screen: the same cases the panel was tested on when it read the SDK's
 * messages itself, now through the translator the process runs
 * (agent/providers/claudeEvents.mjs).
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error -- the agent's process is plain JavaScript, checked by JSDoc
import { historyEvents, translate } from "../agent/providers/claudeEvents.mjs";
import { applyEvent, emptyTranscript, fold, settle, type Transcript } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

const stream = (event: unknown) => ({ type: "stream_event", event, uuid: "u", session_id: "s", parent_tool_use_id: null });
const assistant = (uuid: string, id: string, content: unknown[]) => ({ type: "assistant", uuid, session_id: "s", parent_tool_use_id: null, message: { id, content } });
const user = (content: unknown) => ({ type: "user", session_id: "s", parent_tool_use_id: null, message: { role: "user", content } });
const events = (msgs: unknown[]): AgentEvent[] => msgs.flatMap((m) => translate(m) as AgentEvent[]);
const fold1 = (msgs: unknown[]) => events(msgs).reduce((t: Transcript, ev) => applyEvent(t, ev), emptyTranscript());

describe("claude events", () => {
  it("streams text, then keeps the finished block", () => {
    let t = fold1([
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Olá, " } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "mundo" } }),
    ]);
    expect(t.live!.blocks[0].text).toBe("Olá, mundo");
    expect(t.items).toHaveLength(0);
    t = events([stream({ type: "content_block_stop", index: 0 }), assistant("a1", "m1", [{ type: "text", text: "Olá, mundo" }])]).reduce(applyEvent, t);
    expect(t.live!.blocks).toHaveLength(0);
    expect(t.items).toEqual([{ kind: "text", key: "a1:0", text: "Olá, mundo" }]);
  });

  it("follows a tool call to its result", () => {
    const t = fold1([
      assistant("a1", "m1", [{ type: "thinking", thinking: "Let me read it." }]),
      assistant("a2", "m1", [{ type: "tool_use", id: "tu1", name: "mcp__edukors__read_course", input: {} }]),
      user([{ type: "tool_result", tool_use_id: "tu1", content: [{ type: "text", text: "outline" }] }]),
      assistant("a3", "m2", [{ type: "tool_use", id: "tu2", name: "mcp__edukors__edit_course", input: { summary: "x" } }]),
      user([{ type: "tool_result", tool_use_id: "tu2", content: "The person declined this action.", is_error: true }]),
    ]);
    expect(t.items.map((i) => i.kind)).toEqual(["thinking", "tool", "tool"]);
    expect(t.items[1]).toMatchObject({ kind: "tool", status: "done", result: "outline" });
    expect(t.items[2]).toMatchObject({ kind: "tool", status: "error" });
  });

  it("notes errors, limits and compaction", () => {
    const t = fold1([
      { type: "result", subtype: "error_max_turns", errors: ["too many"], session_id: "s" },
      { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1790000000 }, session_id: "s" },
      { type: "system", subtype: "compact_boundary", session_id: "s" },
      { ...assistant("a9", "m9", []), error: "authentication_failed" },
    ]);
    expect(t.items.map((i) => (i.kind === "notice" ? i.code : i.kind))).toEqual(["error_max_turns", "rate_rejected", "divider", "authentication_failed"]);
  });

  it("keeps what was written when the person interrupts, and does not call it an error", () => {
    const t = fold1([
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Os gatos são" } }),
      user([{ type: "text", text: "[Request interrupted by user]" }]),
      { type: "result", subtype: "error_during_execution", terminal_reason: "aborted_streaming", errors: ["[ede_diagnostic] result_type=user"], session_id: "s" },
    ]);
    expect(t.live).toBeNull();
    expect(t.items).toEqual([{ kind: "text", key: "m1:0", text: "Os gatos são" }, expect.objectContaining({ kind: "notice", level: "info", code: "interrupted" })]);
  });

  it("stops the tool calls a finished turn left running", () => {
    const t = settle(fold1([assistant("a1", "m1", [{ type: "tool_use", id: "tu1", name: "Read", input: {} }])]));
    expect(t.items[0]).toMatchObject({ status: "error" });
  });

  it("leaves out what the panel has no use for", () => {
    expect(events([{ type: "tool_progress" }, { type: "system", subtype: "init" }, { type: "rate_limit_event", rate_limit_info: { status: "allowed" } }])).toEqual([]);
    expect(events([assistant("a1", "m1", [{ type: "tool_use", id: "t", name: "x", input: {} }])])[0]).toMatchObject({ ev: "assistant" });
    // A sub-agent's messages belong to its own task, not to the conversation.
    expect(translate({ type: "assistant", uuid: "a", parent_tool_use_id: "t1", message: { id: "m", content: [] } })).toEqual([]);
  });

  it("reads a conversation back from disk as it was on screen", () => {
    const t = fold(
      historyEvents([
        { type: "user", uuid: "u1", message: { role: "user", content: '<editor-context>\nCourse on screen: "Gatos"\nSelected: q1 (quiz) "Quiz".\n</editor-context>\n\nQuantos passos?' } },
        { type: "assistant", uuid: "a1", message: { id: "m1", content: [{ type: "thinking", thinking: "Reading." }] } },
        { type: "assistant", uuid: "a2", message: { id: "m1", content: [{ type: "tool_use", id: "tu1", name: "mcp__edukors__read_course", input: {} }] } },
        { type: "user", uuid: "u2", message: { role: "user", content: [{ tool_use_id: "tu1", type: "tool_result", content: [{ type: "text", text: "{}" }] }] } },
        { type: "assistant", uuid: "a3", message: { id: "m2", content: [{ type: "text", text: "Dois passos." }] } },
        { type: "user", uuid: "u3", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] } },
      ]) as AgentEvent[],
    );
    expect(t.items.map((i) => i.kind)).toEqual(["user", "thinking", "tool", "text", "notice"]);
    expect(t.items[0]).toEqual({ kind: "user", key: "u1", text: "Quantos passos?", context: "q1 · Quiz" });
    expect(t.items[2]).toMatchObject({ status: "done", result: "{}" });
  });

  it("cuts a tool result that would only weigh on the panel", () => {
    const long = "x".repeat(25_000);
    const [ev] = events([user([{ type: "tool_result", tool_use_id: "t", content: long }])]) as [{ ev: string; text: string }];
    expect(ev.text.length).toBeLessThan(long.length);
    expect(ev.text.endsWith("…")).toBe(true);
  });
});
