/**
 * The AI agent of the side panel, short of Claude itself: the edits it makes
 * to a course (all or nothing, one undo step, references kept), what it reads,
 * the context each message carries, and how the SDK's messages -- streamed or
 * read back from disk -- become the conversation on screen.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "../src/store/editor";
import { docState, dropDoc, openDoc, useDocs } from "../src/store/docs";
import { applyOperations, EditError, outline, placeAdded, type Operation } from "../src/agent/courseEdits";
import { runTool } from "../src/agent/editorTools";
import { messageContext, selectionLabel } from "../src/agent/context";
import { applyMessage, emptyTranscript, fromHistory, settle, splitContext, type Transcript } from "../src/agent/transcript";
import { splitUsage } from "../src/agent/usageReport";
import { diagnose } from "../src/validate";
import type { Course } from "../src/schema/types";
import { positionsOf } from "../src/store/layout";
import { clone, loadSample, SAMPLES } from "./helpers";

const mini = (): Course => clone(loadSample(SAMPLES[0].path));
const short = (): Course => clone(loadSample(SAMPLES[1].path));
const editor = () => useEditor.getState();
const errors = (c: Course) => diagnose(c).issues.filter((i) => i.level === "error");
const loc = (text: string) => [{ lang: "en", text }];

beforeEach(() => {
  for (const id of [...useDocs.getState().order]) dropDoc(id);
});

describe("agent edits", () => {
  it("adds nodes with the next free id, or the one given, and edges to them", () => {
    const c = mini();
    const applied = applyOperations(c, [
      { op: "add_node", node: { type: "quiz", title: loc("Check"), content: { items: [{ question: loc("Lions live in?"), options: [{ value: "a", label: loc("Africa"), correct: true }, { value: "b", label: loc("Europe"), correct: false }] }] } }, near: "sm5" },
      { op: "add_node", node: { id: "sm9", type: "static-md", title: loc("End"), content: { item: loc("Bye") } } },
      { op: "set_edges", from: "sm5", edges: [{ to: "q1" }] },
      { op: "set_edges", from: "q1", edges: [{ to: "sm9" }] },
    ]);
    expect(applied.added).toEqual([{ id: "q1", near: "sm5" }, { id: "sm9", near: undefined }]);
    expect(c.nodes.map((n) => n.id)).toEqual(["sm1", "sh1", "sm2", "sm3", "sm5", "q1", "sm9"]);
    expect(c.edges.slice(-2)).toEqual([{ from: "sm5", to: "q1" }, { from: "q1", to: "sm9" }]);
    expect(errors(c)).toEqual([]);
    expect(applied.changes[0]).toBe("added q1 (quiz)");
  });

  it("refuses an id with the wrong prefix or already taken, naming the operation", () => {
    expect(() => applyOperations(mini(), [{ op: "add_node", node: { id: "q1", type: "static-md", title: loc("x"), content: {} } }])).toThrow(/Operation 1 .*sm and a number/);
    expect(() => applyOperations(mini(), [{ op: "add_node", node: { id: "sm2", type: "static-md", title: loc("x"), content: {} } }])).toThrow(/sm2 is taken; the next free one is sm4/);
    expect(() => applyOperations(mini(), [{ op: "update_node", id: "sm1", title: loc("ok") }, { op: "delete_node", id: "zz9" }])).toThrow(/Operation 2 \(delete_node zz9\): there is no node zz9/);
    expect(() => applyOperations(mini(), [])).toThrow(EditError);
  });

  it("updates the fields it is given and leaves the rest", () => {
    const c = mini();
    applyOperations(c, [{ op: "update_node", id: "sm2", title: loc("Small cats"), section: null }]);
    const node = c.nodes.find((n) => n.id === "sm2")!;
    expect(node.title).toEqual(loc("Small cats"));
    expect(node.section).toBeUndefined();
    expect(node.content).toEqual(mini().nodes.find((n) => n.id === "sm2")!.content);
    expect(() => applyOperations(c, [{ op: "update_node", id: "sm2" }])).toThrow(/nothing to change/);
  });

  it("deletes a node with its edges, and a new start when it was the start", () => {
    const c = mini();
    const { changes } = applyOperations(c, [{ op: "delete_node", id: "sm1" }]);
    expect(c.info.start).toBe("sh1");
    expect(c.edges.some((e) => e.from === "sm1" || e.to === "sm1")).toBe(false);
    expect(changes[0]).toBe("deleted sm1 and its 1 edge; the start is now sh1");
  });

  it("renames a node and every reference to it", () => {
    const c = short();
    applyOperations(c, [{ op: "rename_node", id: "q1", new_id: "q7" }]);
    expect(c.edges.filter((e) => e.from === "q7" || e.to === "q7")).toHaveLength(3);
    expect(JSON.stringify(c.edges)).not.toContain('"q1');
    expect(errors(c)).toEqual([]);
    expect(() => applyOperations(short(), [{ op: "rename_node", id: "q1", new_id: "sm9" }])).toThrow(/q and a number/);
  });

  it("replaces a node's edges where they were, leaving every other edge in its place", () => {
    const c = short();
    const before = c.edges.filter((e) => e.from !== "q1");
    applyOperations(c, [{ op: "set_edges", from: "q1", edges: [{ to: "dm1", when: { key: "q1.percent", operator: "lt", value: 50 } }, { to: "f1" }] }]);
    expect(c.edges.slice(3, 5)).toEqual([
      { from: "q1", to: "dm1", when: { key: "q1.percent", operator: "lt", value: 50 } },
      { from: "q1", to: "f1" },
    ]);
    expect(c.edges.filter((e) => e.from !== "q1")).toEqual(before);
    applyOperations(c, [{ op: "set_edges", from: "q1", edges: [] }]);
    expect(c.edges.some((e) => e.from === "q1")).toBe(false);
  });

  it("changes the course info, opening every text in a language it adds", () => {
    const c = mini();
    applyOperations(c, [{ op: "update_info", info: { "other-languages": ["pt"], description: null, version: "1.2.0" } }]);
    expect(c.info["other-languages"]).toEqual(["pt"]);
    expect(c.info.description).toBeUndefined();
    expect(c.info.version).toBe("1.2.0");
    expect(c.nodes[0].title).toEqual([c.nodes[0].title[0], { lang: "pt", text: "" }]);
    expect(() => applyOperations(mini(), [{ op: "update_info", info: { "course-id": "something-else" } }])).toThrow(/course-id/);
    expect(() => applyOperations(mini(), [{ op: "update_info", info: { start: "nope1" } }])).toThrow(/no node nope1/);
    expect(() => applyOperations(mini(), [{ op: "update_info", info: { title: null } }])).toThrow(/cannot be removed/);
  });

  it("places new nodes beside the node they follow, clear of the others", () => {
    const c = mini();
    applyOperations(c, [{ op: "add_node", node: { type: "bool", title: loc("?"), content: { question: loc("Ready?") } }, near: "sm1" }]);
    const positions = { sm1: { x: 0, y: 0 }, sh1: { x: 280, y: 0 } };
    const placed = placeAdded(c, positions, [{ id: "b1", near: "sm1" }]);
    expect(placed.b1.x).toBe(280);
    expect(placed.b1.y).toBeGreaterThan(0);
  });

  it("outlines a course without the content of its nodes", () => {
    const o = outline(short());
    expect(o.nodes.find((n) => n.id === "q1")).toEqual({ id: "q1", type: "quiz", section: 2, title: expect.any(String) });
    expect(o.edges[3]).toMatchObject({ i: 3, from: "q1", to: "f1" });
    expect(o.keys).toContain("q1.percent: 0–100");
    expect(JSON.stringify(o)).not.toContain('"content"');
  });
});

describe("agent tools in the editor", () => {
  it("read the course of the conversation without changing the screen", async () => {
    const a = openDoc(mini(), { path: "/courses/a.json", saved: true });
    const b = openDoc(short(), { path: "/courses/b.json", saved: true });
    expect(editor().docId).toBe(b);
    const outlineText = (await runTool("read_course", {}, a)).text;
    expect(outlineText).toContain('Course "Cats of the World 1 (mini)" (a.json)');
    expect(outlineText).toContain('"id": "sh1"');
    const nodes = await runTool("read_course", { nodes: ["sh1"] }, a);
    expect(nodes.text).toContain('"content"');
    expect((await runTool("read_course", { nodes: ["zz1"] }, a)).isError).toBe(true);
    expect(editor().docId).toBe(b);
  });

  it("make each edit one undo step, on screen, and report the validation", async () => {
    const a = openDoc(mini(), { path: "/courses/a.json", saved: true });
    const b = openDoc(short(), { path: "/courses/b.json", saved: true });
    const ops: Operation[] = [{ op: "update_node", id: "sm2", title: loc("Small wild cats") }];
    const result = await runTool("edit_course", { summary: "rename a step", operations: ops }, a);
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("applied 1 operation as one undo step");
    expect(result.text).toContain("Validation:");
    expect(editor().docId).toBe(a);
    expect(editor().course!.nodes.find((n) => n.id === "sm2")!.title).toEqual(loc("Small wild cats"));
    editor().undo();
    expect(editor().course!.nodes.find((n) => n.id === "sm2")!.title).toEqual(mini().nodes.find((n) => n.id === "sm2")!.title);
    expect(docState(b)!.course!.nodes).toHaveLength(9);
  });

  it("leave the course as it was when an edit fails", async () => {
    const a = openDoc(mini(), { path: null, saved: true });
    const before = editor().course;
    const result = await runTool("edit_course", { operations: [{ op: "update_node", id: "sm1", title: loc("x") }, { op: "delete_node", id: "zz1" }] }, a);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Nothing was changed");
    expect(editor().course).toBe(before);
    expect(editor().past).toHaveLength(0);
  });

  it("give new nodes a place on the canvas", async () => {
    const course = mini();
    course.nodes.find((n) => n.id === "sm5")!.position = { x: 1000, y: 40 };
    const a = openDoc(course, { path: null, saved: true });
    await runTool("edit_course", { operations: [{ op: "add_node", node: { type: "bool", title: loc("More?"), content: { question: loc("More?") } }, near: "sm5" }] }, a);
    expect(positionsOf(editor().course).b1).toEqual({ x: 1280, y: 40 });
  });

  it("open a new course and work on it from then on", async () => {
    const result = await runTool("new_course", { title: "Frações", language: "pt" }, null);
    expect(result.docId).toBe(editor().docId);
    expect(editor().course!.info["source-language"]).toBe("pt");
    expect(editor().course!.info.title).toEqual([{ lang: "pt", text: "Frações" }]);
    expect((await runTool("new_course", { title: "x", language: "Portuguese" }, null)).isError).toBe(true);
  });

  it("say when no course is open", async () => {
    const result = await runTool("read_course", {}, null);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No course is open");
  });

  it("show a node and validate, and know the schema", async () => {
    const a = openDoc(short(), { path: null, saved: true });
    await runTool("show_node", { id: "s1" }, a);
    expect(editor().selection.nodes).toEqual(["s1"]);
    expect((await runTool("validate_course", {}, a)).text).toMatch(/error|Valid/);
    expect((await runTool("get_schema", {}, null)).text).toContain("quizContent");
    expect((await runTool("get_schema", { definition: "quizQuestion" }, null)).text).toContain('"options"');
    expect((await runTool("get_schema", { definition: "nope" }, null)).isError).toBe(true);
    expect((await runTool("no_such_tool", {}, a)).isError).toBe(true);
  });

  it("replace the whole course, keeping its identity", async () => {
    const a = openDoc(mini(), { path: null, saved: true });
    const id = editor().course!.info["course-id"];
    const next = short();
    const result = await runTool("replace_course", { summary: "rewrite", course: next }, a);
    expect(result.isError).toBeFalsy();
    expect(editor().course!.nodes).toHaveLength(9);
    expect(editor().course!.info["course-id"]).toBe(id);
    expect(editor().layoutRequested).toBeGreaterThan(0);
  });
});

describe("agent context", () => {
  it("tells the agent the course on screen and the selection, and the panel reads the selection back", () => {
    openDoc(short(), { path: "/courses/short.json", saved: true });
    editor().select({ nodes: ["q1"], edge: null });
    const { block, docId } = messageContext(true);
    expect(docId).toBe(editor().docId);
    expect(block).toContain("short.json");
    expect(block).toMatch(/Selected: q1 \(quiz\) ".+"\./);
    expect(splitContext(`${block}\n\nMake it harder`)).toEqual({ text: "Make it harder", context: selectionLabel()! });
    expect(messageContext(false).block).not.toContain("Selected");
  });

  it("labels several nodes and edges the same way on both sides", () => {
    openDoc(short(), { path: null, saved: true });
    editor().select({ nodes: ["q1", "f1"], edge: null });
    expect(splitContext(messageContext(true).block + "\n\nhi").context).toBe(selectionLabel());
    editor().select({ nodes: [], edge: 3 });
    expect(splitContext(messageContext(true).block + "\n\nhi").context).toBe("q1 → f1");
  });

  it("says when no course is open", () => {
    expect(messageContext(true).block).toContain("No course is open");
  });
});

describe("agent transcript", () => {
  const stream = (event: unknown) => ({ type: "stream_event", event, uuid: "u", session_id: "s", parent_tool_use_id: null }) as never;
  const assistant = (uuid: string, id: string, content: unknown[]) => ({ type: "assistant", uuid, session_id: "s", parent_tool_use_id: null, message: { id, content } }) as never;
  const user = (content: unknown) => ({ type: "user", session_id: "s", parent_tool_use_id: null, message: { role: "user", content } }) as never;
  const fold = (msgs: never[]) => msgs.reduce((t: Transcript, m) => applyMessage(t, m), emptyTranscript());

  it("streams text, then keeps the finished block", () => {
    let t = fold([stream({ type: "message_start", message: { id: "m1" } }), stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }), stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Olá, " } }), stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "mundo" } })]);
    expect(t.live!.blocks[0].text).toBe("Olá, mundo");
    expect(t.items).toHaveLength(0);
    t = applyMessage(applyMessage(t, stream({ type: "content_block_stop", index: 0 })), assistant("a1", "m1", [{ type: "text", text: "Olá, mundo" }]));
    expect(t.live!.blocks).toHaveLength(0);
    expect(t.items).toEqual([{ kind: "text", key: "a1:0", text: "Olá, mundo" }]);
  });

  it("follows a tool call to its result", () => {
    const t = fold([
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
    const t = fold([
      { type: "result", subtype: "error_max_turns", errors: ["too many"], session_id: "s" } as never,
      { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1790000000 }, session_id: "s" } as never,
      { type: "system", subtype: "compact_boundary", session_id: "s" } as never,
      { ...(assistant("a9", "m9", []) as object), error: "authentication_failed" } as never,
    ]);
    expect(t.items.map((i) => (i.kind === "notice" ? i.code : i.kind))).toEqual(["error_max_turns", "rate_rejected", "divider", "authentication_failed"]);
  });

  it("keeps what was written when the person interrupts, and does not call it an error", () => {
    const t = fold([
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Os gatos são" } }),
      user([{ type: "text", text: "[Request interrupted by user]" }]),
      { type: "result", subtype: "error_during_execution", terminal_reason: "aborted_streaming", errors: ["[ede_diagnostic] result_type=user"], session_id: "s" } as never,
    ]);
    expect(t.live).toBeNull();
    expect(t.items).toEqual([{ kind: "text", key: "m1:0", text: "Os gatos são" }, expect.objectContaining({ kind: "notice", level: "info", code: "interrupted" })]);
  });

  it("stops the tool calls a finished turn left running", () => {
    const t = settle(fold([assistant("a1", "m1", [{ type: "tool_use", id: "tu1", name: "Read", input: {} }])]));
    expect(t.items[0]).toMatchObject({ status: "error" });
  });

  it("reads a conversation back from disk as it was on screen", () => {
    const t = fromHistory([
      { type: "user", uuid: "u1", message: { role: "user", content: '<editor-context>\nCourse on screen: "Gatos"\nSelected: q1 (quiz) "Quiz".\n</editor-context>\n\nQuantos passos?' } },
      { type: "assistant", uuid: "a1", message: { id: "m1", content: [{ type: "thinking", thinking: "Reading." }] } },
      { type: "assistant", uuid: "a2", message: { id: "m1", content: [{ type: "tool_use", id: "tu1", name: "mcp__edukors__read_course", input: {} }] } },
      { type: "user", uuid: "u2", message: { role: "user", content: [{ tool_use_id: "tu1", type: "tool_result", content: [{ type: "text", text: "{}" }] }] } },
      { type: "assistant", uuid: "a3", message: { id: "m2", content: [{ type: "text", text: "Dois passos." }] } },
      { type: "user", uuid: "u3", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] } },
    ]);
    expect(t.items.map((i) => i.kind)).toEqual(["user", "thinking", "tool", "text", "notice"]);
    expect(t.items[0]).toEqual({ kind: "user", key: "u1", text: "Quantos passos?", context: "q1 · Quiz" });
    expect(t.items[2]).toMatchObject({ status: "done", result: "{}" });
  });
});

describe("agent usage", () => {
  // Claude Code's /usage report, as it came on 2026-10-02.
  const REPORT = `You are currently using your subscription to power your Claude Code usage

Current session: 22% used · resets Oct 2 at 1:39pm (America/Sao_Paulo)
Current week (all models): 4% used · resets Oct 8 at 6:59am (America/Sao_Paulo)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai.

Last 24h · 751 requests · 23 sessions
  82% of your usage was at >150k context`;

  it("puts each window's line on top, as written, with the share used", () => {
    const { windows, rest } = splitUsage(REPORT);
    expect(windows).toEqual([
      { line: "Current session: 22% used · resets Oct 2 at 1:39pm (America/Sao_Paulo)", percent: 22 },
      { line: "Current week (all models): 4% used · resets Oct 8 at 6:59am (America/Sao_Paulo)", percent: 4 },
    ]);
    expect(rest.startsWith("You are currently using your subscription")).toBe(true);
    expect(rest).toContain("  82% of your usage was at >150k context");
    expect(rest).not.toContain("Current session");
  });

  it("shows a report it cannot read whole, and a window without a percentage without a bar", () => {
    expect(splitUsage("You are using an API key.\nCost so far: $0.12")).toEqual({ windows: [], rest: "You are using an API key.\nCost so far: $0.12" });
    expect(splitUsage("Current session: resets soon").windows).toEqual([{ line: "Current session: resets soon" }]);
    expect(splitUsage("Current week: 140% used").windows[0].percent).toBe(100);
    expect(splitUsage("")).toEqual({ windows: [], rest: "" });
  });
});
