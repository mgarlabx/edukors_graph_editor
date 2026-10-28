/**
 * The agent panel against the real EDUKORS AI library host, the same program
 * the app starts (node_modules/@edukors/ai-cli/dist/host/main.js), run with the
 * library's fake provider: a separate CLI process that signs in, answers, calls
 * the editor's tools and asks questions on cue, with no account and no network.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Incoming, Transport } from "../src/agent/client";
import type { Course } from "../src/schema/types";
import { clone, loadSample, SAMPLES } from "./helpers";

const HOST = join(__dirname, "..", "node_modules", "@edukors", "ai-cli", "dist", "host", "main.js");
const dataDir = mkdtempSync(join(tmpdir(), "graph agent panel "));

let child: ChildProcess | null = null;
let listener: ((msg: Incoming) => void) | null = null;
let generation = 0;

const transport: Transport = {
  async start() {
    if (child && child.exitCode === null) return { generation, fresh: false };
    const gen = ++generation;
    child = spawn(process.execPath, [HOST, "--app-id", "graph-test", "--fake", "--data-dir", dataDir], { stdio: ["pipe", "pipe", "pipe"] });
    createInterface({ input: child.stdout! }).on("line", (line) => listener?.({ ...JSON.parse(line), gen }));
    child.on("exit", () => listener?.({ t: "exit", gen, stderr: "" }));
    return { generation: gen, fresh: true };
  },
  async send(msg) {
    child?.stdin?.write(JSON.stringify(msg) + "\n");
  },
  async stop() {
    child?.kill();
    child = null;
  },
  async listen(cb) {
    listener = cb;
    return () => undefined;
  },
};

// The panel runs in a webview; here, a window with the transport, and no Tauri.
const memory = new Map<string, string>();
Object.assign(globalThis, {
  window: { __edukorsAgentTransport: transport },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
});

const { useAgent } = await import("../src/agent/store");
const { openDoc, dropDoc, useDocs } = await import("../src/store/docs");
const { useEditor } = await import("../src/store/editor");
const { toolSpecs } = await import("../src/agent/toolSpecs");

const agent = () => useAgent.getState();
const mini = (): Course => clone(loadSample(SAMPLES[0].path));

async function until(check: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** The text of the agent's answer to the last message. */
const lastText = () => {
  const items = agent().items;
  const at = items.map((i) => i.kind).lastIndexOf("user");
  return items
    .slice(at + 1)
    .filter((i) => i.kind === "text")
    .map((i) => (i as { text: string }).text)
    .join("");
};

async function sendAndWait(text: string) {
  await agent().send(text);
  await until(() => !agent().busy);
}

beforeAll(() => {
  for (const id of [...useDocs.getState().order]) dropDoc(id);
});

afterAll(async () => {
  await transport.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("agent panel over the library", () => {
  beforeEach(() => {
    if (agent().mode !== "ask") agent().setMode("ask");
  });

  it("starts with no account and says so", async () => {
    await agent().ensure();
    expect(agent().connection).toBe("ready");
    expect(agent().accountId).toBeNull();
    expect(agent().detections.map((d) => d.providerId)).toEqual(expect.arrayContaining(["claude", "codex", "fake"]));
  });

  it("adds an account, signs it in and opens a conversation on it", async () => {
    const id = await agent().addAccount("fake" as never, "Escola");
    await agent().connectAccount(id);
    await until(() => !!agent().sessionId);
    expect(agent().accountId).toBe(id);
    expect(agent().signIn).toBeNull();
    expect(await agent().accountStatus(id)).toMatchObject({ state: "connected", identity: "Escola" });
  });

  it("sends a message with the editor's context and tools, and shows the answer", async () => {
    openDoc(mini(), { path: "/courses/mini.json", saved: true });
    await sendAndWait("hello");
    // The fake echoes the person's words; the context block went before them, with the course on screen.
    expect(lastText()).toBe(`Echo: hello [history 0, model default, tools ${toolSpecs().length}]`);
    expect(agent().items[0]).toMatchObject({ kind: "user", text: "hello" });
  });

  it("runs a read tool without asking, and shows its card with the input and result", async () => {
    const docId = useEditor.getState().docId;
    await sendAndWait('tool read_course {"nodes":["sm1"]}');
    const card = agent().items.find((i) => i.kind === "tool");
    expect(card).toMatchObject({ name: "read_course", input: { nodes: ["sm1"] }, status: "done" });
    expect((card as { result: string }).result).toContain('"id": "sm1"');
    expect(lastText()).toContain("Tool read_course said:");
    expect(useEditor.getState().docId).toBe(docId);
  });

  it("asks before changing the course, and does not change it when the person declines", async () => {
    const before = JSON.stringify(useEditor.getState().course);
    const edit = '{"summary":"rename","operations":[{"op":"update_node","id":"sm2","title":[{"lang":"en","text":"Renamed"}]}]}';
    void agent().send(`tool edit_course ${edit}`);
    await until(() => agent().asks.some((a) => a.kind === "permission"));
    const ask = agent().asks[0]!;
    expect(ask.tool).toBe("mcp__edukors__edit_course");
    agent().answer(ask.id, { behavior: "deny", message: "Not this one." });
    await until(() => !agent().busy);
    expect(lastText()).toContain("Not this one.");
    expect(JSON.stringify(useEditor.getState().course)).toBe(before);

    void agent().send(`tool edit_course ${edit}`);
    await until(() => agent().asks.some((a) => a.kind === "permission"));
    agent().answer(agent().asks[0]!.id, { behavior: "allow" });
    await until(() => !agent().busy);
    expect(useEditor.getState().course!.nodes.find((n) => n.id === "sm2")!.title).toEqual([{ lang: "en", text: "Renamed" }]);
  });

  it("refuses changes in plan mode without asking", async () => {
    agent().setMode("plan");
    await sendAndWait('tool edit_course {"summary":"x","operations":[{"op":"delete_node","id":"sm2"}]}');
    expect(agent().asks).toHaveLength(0);
    expect(lastText()).toContain("Plan mode is on");
    expect(useEditor.getState().course!.nodes.some((n) => n.id === "sm2")).toBe(true);
  });

  it("puts the provider's question to the person and sends the answer back", async () => {
    void agent().send("ask");
    await until(() => agent().asks.some((a) => a.kind === "question"));
    const card = agent().asks[0]!;
    expect(card.input).toMatchObject({ questions: [{ question: "Which color?", options: [{ label: "red" }, { label: "blue" }] }] });
    agent().answer(card.id, { behavior: "allow", updatedInput: { answers: { "Which color?": "blue" } } });
    await until(() => !agent().busy);
    expect(lastText()).toBe("You chose blue");
  });

  it("stops a turn, keeps what was written and marks it interrupted", async () => {
    void agent().send("slow");
    await until(() => !!agent().live?.blocks[0]?.text);
    agent().interrupt();
    await until(() => !agent().busy);
    const items = agent().items;
    expect(items[items.length - 1]).toMatchObject({ kind: "notice", code: "interrupted" });
    expect(lastText()).toMatch(/^\.+$/);
  });

  it("starts a new conversation on the same account", async () => {
    const before = agent().conversationId;
    await agent().newSession();
    await until(() => !!agent().sessionId);
    expect(agent().conversationId).not.toBe(before);
    expect(agent().items).toEqual([]);
    await sendAndWait("again");
    expect(lastText()).toContain("[history 0,");
  });
});
