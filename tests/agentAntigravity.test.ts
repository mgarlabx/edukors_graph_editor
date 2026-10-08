/**
 * The Antigravity CLI's stream, as the conversation on screen, and the journal
 * the editor keeps of it (the CLI's own history is not ours to read).
 *
 * The fixtures in tests/fixtures/agy/ follow the shapes the CLI's headless
 * mode documents. To capture a real one:
 *   echo '{"event":"user","message":{"content":"oi"}}' | \
 *     agy --input-format stream-json --output-format stream-json > turn.ndjson
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- the agent's process is plain JavaScript, checked by JSDoc
import { authFailure, createMapper, parseModels } from "../agent/providers/antigravityEvents.mjs";
// @ts-expect-error -- as above
import { journal } from "../agent/journal.mjs";
// @ts-expect-error -- as above
import { allowed } from "../agent/providers/antigravityGuard.mjs";
import { applyEvent, emptyTranscript, fold, type Transcript } from "../src/agent/transcript";
import type { AgentEvent } from "../src/agent/events";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", "agy", `${name}.ndjson`), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

/** The editor's own tools are the ones the bridge shows; the rest are the CLI's. */
const ownsTool = (name: string, parameters: Record<string, unknown> = {}) => name.startsWith("mcp__edukors__") || parameters.ServerName === "edukors";
const play = (name: string) => {
  const mapper = createMapper({ ownsTool });
  const events: AgentEvent[] = fixture(name).flatMap((line) => mapper.map(line) as AgentEvent[]);
  return { mapper, events, transcript: events.reduce((t: Transcript, ev) => applyEvent(t, ev), emptyTranscript()) };
};

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "edukors-journal-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("antigravity stream", () => {
  it("learns the conversation and the tools from the CLI's hello", () => {
    const { mapper, events } = play("text-turn");
    expect(mapper.conversationId).toBe("3f2c1a");
    expect(mapper.tools).toContain("mcp__edukors__edit_course");
    // The hello itself says nothing to the person.
    expect(events[0].ev).toBe("msg_start");
  });

  it("streams an answer and settles it into one text", () => {
    const { transcript } = play("text-turn");
    expect(transcript.live).toBeNull();
    expect(transcript.items).toEqual([{ kind: "text", key: "agy-1:1", text: "O curso tem seis passos." }]);
  });

  it("leaves the editor's own tools to the bridge, by name or by the server they call", () => {
    const mapper = createMapper({ ownsTool });
    // The CLI reaches an MCP server through a tool of its own, naming the server in its arguments.
    const wrapper = (state: string, extra: Record<string, unknown> = {}) => ({
      event: "step_update",
      step_update: { step_index: 9, state, step_type: "tool", tool_name: "call_mcp_tool", tool_info: { name: "call_mcp_tool", parameters: { ServerName: "edukors", ToolName: "validate_course", Arguments: {} }, ...extra } },
    });
    expect(mapper.map(wrapper("ACTIVE"))).toEqual([]);
    expect(mapper.map(wrapper("DONE", { output: "no errors" }))).toEqual([]);
    // Another server's tool is the CLI's business, and is shown.
    const other = { ...wrapper("ACTIVE"), step_update: { step_index: 10, state: "ACTIVE", step_type: "tool", tool_name: "call_mcp_tool", tool_info: { name: "call_mcp_tool", parameters: { ServerName: "files", ToolName: "read" } } } };
    expect(mapper.map(other)).toHaveLength(1);
  });

  it("leaves the editor's own tools to the bridge and shows the CLI's", () => {
    const { transcript } = play("tools-turn");
    expect(transcript.items.map((i) => i.kind)).toEqual(["tool", "text"]);
    expect(transcript.items[0]).toMatchObject({ kind: "tool", name: "codesearch", status: "done", result: "nothing found" });
  });

  it("keeps what was written when a turn is interrupted, without calling it an error", () => {
    const { transcript } = play("interrupted");
    expect(transcript.items[0]).toMatchObject({ kind: "text", text: "Vou come" });
    expect(transcript.items[1]).toMatchObject({ kind: "notice", level: "info", code: "interrupted" });
  });

  it("reports the CLI's own failures with its words", () => {
    const { events } = play("error");
    expect(events.at(-1)).toEqual({ ev: "turn_end", status: "error", code: "agy_error", text: "model not available" });
  });

  it("does not lose a reply that arrived only in the result", () => {
    const mapper = createMapper({ ownsTool });
    const events: AgentEvent[] = mapper.map({ event: "result", result: { conversation_id: "x", status: "SUCCESS", response: "Feito." } });
    expect(events[0]).toMatchObject({ ev: "assistant", blocks: [{ type: "text", text: "Feito." }] });
    expect(events[1]).toEqual({ ev: "turn_end", status: "success" });
  });

  it("reads the models the CLI lists, however it lists them", () => {
    expect(parseModels('["gemini-3.8-flash-high","gemini-3.8-flash-low"]')).toEqual([
      { value: "gemini-3.8-flash-high", displayName: "gemini-3.8-flash-high" },
      { value: "gemini-3.8-flash-low", displayName: "gemini-3.8-flash-low" },
    ]);
    expect(parseModels("MODEL            DESCRIPTION\ngemini-3.8-flash-high   deep\ngemini-3.8-flash-low    fast")).toHaveLength(2);
    expect(parseModels('[{"id":"gemini-3.8-flash-medium","name":"Gemini 3.8 Flash (Medium)"}]')).toEqual([
      { value: "gemini-3.8-flash-medium", displayName: "Gemini 3.8 Flash (Medium)" },
    ]);
    expect(parseModels("")).toEqual([]);
  });

  it("tells a sign-in problem from any other failure", () => {
    expect(authFailure("Error: please sign in with your Google account")).toBe(true);
    expect(authFailure("could not read credentials from the keyring")).toBe(true);
    expect(authFailure("ENOENT: no such file")).toBe(false);
  });
});

describe("the agent's journal", () => {
  it("keeps a conversation and reads it back as it was", () => {
    const jrn = journal(tempDir());
    jrn.start("s1", { sid: "s1" });
    jrn.setMeta("s1", { conversation: "agy-7" });
    for (const ev of [
      { ev: "user", key: "u1", text: '<editor-context>\nCourse on screen: "Gatos"\nMode: ask.\n</editor-context>\n\nQuantos passos?' },
      { ev: "assistant", uuid: "a1", blocks: [{ type: "tool_use", index: 0, id: "t1", name: "mcp__edukors__read_course", input: {} }] },
      { ev: "tool_result", toolUseId: "t1", text: "outline" },
      { ev: "assistant", uuid: "a2", blocks: [{ type: "text", index: 0, text: "Seis." }] },
      { ev: "turn_end", status: "success" },
    ])
      jrn.append("s1", ev);
    expect(jrn.meta("s1").conversation).toBe("agy-7");
    const t = fold(jrn.read("s1") as AgentEvent[]);
    expect(t.items.map((i) => i.kind)).toEqual(["user", "tool", "text"]);
    expect(t.items[0]).toEqual({ kind: "user", key: "u1", text: "Quantos passos?" });
    expect(t.items[1]).toMatchObject({ status: "done", result: "outline" });
  });

  it("lists the conversations, the last written first, with the first message", () => {
    const dir = tempDir();
    const jrn = journal(dir);
    jrn.start("old", { sid: "old" });
    jrn.append("old", { ev: "user", key: "u", text: "o primeiro" });
    jrn.start("new", { sid: "new" });
    jrn.append("new", { ev: "user", key: "u", text: "o segundo" });
    const list = jrn.list();
    expect(list.map((s: { id: string }) => s.id)).toEqual(["new", "old"]);
    expect(list[0].firstPrompt).toBe("o segundo");
    expect(list[0].lastModified).toBeGreaterThan(0);
    jrn.remove("new");
    expect(jrn.list().map((s: { id: string }) => s.id)).toEqual(["old"]);
  });

  it("says nothing of a conversation it has no file for", () => {
    const jrn = journal(join(tempDir(), "nothing-here"));
    expect(jrn.list()).toEqual([]);
    expect(jrn.read("nope")).toEqual([]);
    expect(jrn.meta("nope")).toEqual({});
  });
});

/**
 * The CLI runs with its own permission prompts off -- headless, it would
 * otherwise deny everything it cannot ask about -- so this hook is what holds
 * it to the editor's tools.
 */
describe("the guard before every tool call", () => {
  it("lets the editor's own server through", () => {
    expect(allowed({ name: "call_mcp_tool", args: { ServerName: "edukors", ToolName: "read_course" } }, "edukors")).toBe(true);
  });

  it("refuses another MCP server, whatever it is called", () => {
    expect(allowed({ name: "call_mcp_tool", args: { ServerName: "filesystem", ToolName: "list_dir" } }, "edukors")).toBe(false);
    expect(allowed({ name: "call_mcp_tool", args: {} }, "edukors")).toBe(false);
  });

  it("refuses the CLI's own tools, were it ever to keep them", () => {
    for (const name of ["run_command", "write_to_file", "multi_replace_file_content", "open_browser_url", "read_url_content", "view_file"])
      expect(allowed({ name, args: {} }, "edukors")).toBe(false);
  });

  it("leaves the steps of its own working alone", () => {
    for (const name of ["finish", "wait", "ask_question"]) expect(allowed({ name, args: {} }, "edukors")).toBe(true);
  });

  it("refuses a call it cannot read", () => {
    expect(allowed(null, "edukors")).toBe(false);
    expect(allowed({}, "edukors")).toBe(false);
  });
});
