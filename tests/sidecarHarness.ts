/**
 * The agent's process, driven as the app drives it: one child process spoken
 * to in JSON lines, with the editor's side of the conversation played here
 * (the tool calls it runs, the cards the person answers).
 *
 * The providers that run as a CLI of their own are played by stand-ins
 * (tests/fake-agy.mjs, tests/fake-codex.mjs), so what is tested is everything
 * the editor owns, short of the vendors' binaries.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "../src/agent/events";

export const root = join(import.meta.dirname, "..");

export interface Sidecar {
  cwd: string;
  /** every line the process has written */
  lines: any[];
  /** the tool calls the editor was asked to run */
  editorCalls: { name: string; args: any }[];
  /** the cards the person was shown */
  asked: any[];
  /** how the person answers each kind of card; a test changes these */
  answers: Record<string, (ask: any) => Record<string, unknown>>;
  /** what the editor replies to a tool call */
  toolReply: (name: string, args: any) => { text: string; isError?: boolean };
  send(msg: Record<string, unknown>): void;
  request(t: string, payload?: Record<string, unknown>): Promise<any>;
  waitFor(match: (msg: any) => boolean, what?: string, timeout?: number): Promise<any>;
  /** waits for the end of the nth turn of this run */
  waitForTurn(n: number): Promise<any>;
  events(sid: string): AgentEvent[];
  stop(): Promise<void>;
}

export function startSidecar(env: Record<string, string> = {}): Promise<Sidecar> {
  const cwd = mkdtempSync(join(tmpdir(), "edukors-sidecar-"));
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [join(root, "agent", "sidecar.mjs")], {
    env: { ...process.env, EDUKORS_AGENT_CWD: cwd, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr.resume();

  const lines: any[] = [];
  const editorCalls: { name: string; args: any }[] = [];
  const asked: any[] = [];
  const waiters: { match: (msg: any) => boolean; resolve: (msg: any) => void; timer: ReturnType<typeof setTimeout> }[] = [];

  const sidecar: Sidecar = {
    cwd,
    lines,
    editorCalls,
    asked,
    answers: {
      permission: () => ({ behavior: "allow" }),
      question: (ask) => ({ behavior: "allow", updatedInput: { ...ask.input, answers: { "Para qual ano?": "6º ano" } } }),
      plan: () => ({ behavior: "allow", mode: "ask" }),
    },
    toolReply: (name) => ({ text: name === "read_course" ? "6 nodes, 5 edges" : `${name}: applied` }),
    send: (msg) => child.stdin.write(JSON.stringify(msg) + "\n"),
    waitFor: (match, what = "a message", timeout = 30_000) =>
      new Promise((resolve, reject) => {
        const found = lines.find(match);
        if (found) return resolve(found);
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), timeout);
        waiters.push({ match, resolve, timer });
      }),
    // The nth end of a turn, and that one: a later one must not answer for it.
    waitForTurn: (n) =>
      sidecar.waitFor(
        (m) => m.t === "ev" && m.ev.ev === "turn_end" && lines.filter((l) => l.t === "ev" && l.ev.ev === "turn_end").indexOf(m) === n - 1,
        `turn ${n} to end`,
      ),
    async request(t, payload = {}) {
      const id = `q${Math.random().toString(36).slice(2)}`;
      sidecar.send({ t, id, ...payload });
      const reply = await sidecar.waitFor((m) => m.t === "reply" && m.id === id, `the reply to ${t}`);
      if (!reply.ok) throw Object.assign(new Error(`${t}: ${reply.error}`), { code: reply.code });
      return reply.data;
    },
    events: (sid) => lines.filter((m) => m.t === "ev" && m.sid === sid).map((m) => m.ev),
    async stop() {
      child.stdin.end();
      await new Promise((r) => setTimeout(r, 500));
      if (child.exitCode === null) child.kill();
      rmSync(cwd, { recursive: true, force: true });
    },
  };

  createInterface({ input: child.stdout }).on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    lines.push(msg);
    // The editor answers the tool calls and the cards, as the panel does.
    if (msg.t === "tool") {
      editorCalls.push({ name: msg.name, args: msg.args });
      sidecar.send({ t: "tool_reply", id: msg.id, ...sidecar.toolReply(msg.name, msg.args) });
    }
    if (msg.t === "ask") {
      asked.push(msg);
      sidecar.send({ t: "answer", id: msg.id, ...(sidecar.answers[msg.kind]?.(msg) ?? { behavior: "deny" }) });
    }
    for (const waiter of [...waiters]) {
      if (!waiter.match(msg)) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(msg);
    }
  });

  return sidecar.waitFor((m) => m.t === "ready", "the process to say hello").then(() => sidecar);
}
