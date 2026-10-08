/**
 * The line to the agent's process (agent/sidecar.mjs), through the app
 * (src-tauri/src/agent.rs): requests that get a reply, notes that do not, and
 * what the process sends on its own -- the conversation's events, questions
 * for the person, tool calls for the editor.
 *
 * In a plain browser (`npm run dev`) there is no process to start. A test can
 * put its own transport in `window.__edukorsAgentTransport`.
 */
import type { AgentEvent, ProviderId, ProviderState } from "./events";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../app/platform";

export type AskKind = "permission" | "question" | "plan";

/** One of the person's MCP servers, as Claude Code reports it. */
export interface McpState {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  error?: string;
}

/** One of the person's skills, from the agent's skills folder. */
export interface SkillInfo {
  name: string;
  description: string;
  dir: string;
}

/** What the process sends. The app stamps each with `gen`, the process that wrote it. */
export type Incoming = { gen?: number } & (
  | { t: "ready"; cwd: string; providers: ProviderState[] }
  | { t: "fatal"; code: string; message: string }
  | { t: "reply"; id: string; ok: boolean; data?: unknown; error?: string; code?: string }
  | { t: "ev"; sid: string; ev: AgentEvent }
  | { t: "ask"; id: string; sid: string; kind: AskKind; tool: string; input: Record<string, unknown>; toolUseId: string; reason: string | null; blockedPath?: string | null; once?: boolean }
  | { t: "ask_cancel"; id: string }
  | { t: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { t: "mcp"; sid: string; servers: McpState[] }
  | { t: "login"; provider: ProviderId; ok: boolean; error?: string }
  | { t: "ended"; sid: string; error?: string }
  | { t: "exit"; stderr?: string }
  | { t: "log"; text: string }
);

export interface Transport {
  start(): Promise<{ generation: number; fresh: boolean }>;
  send(msg: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
  listen(cb: (msg: Incoming) => void): Promise<() => void>;
}

declare global {
  interface Window {
    __edukorsAgentTransport?: Transport;
  }
}

const tauriTransport: Transport = {
  start: () => invoke("agent_start"),
  send: (msg) => invoke("agent_send", { msg }),
  stop: () => invoke("agent_stop"),
  async listen(cb) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<Incoming>("agent", (e) => cb(e.payload));
  },
};

const transport = (): Transport | null =>
  (typeof window !== "undefined" && window.__edukorsAgentTransport) || (isTauri() ? tauriTransport : null);

/** Why the agent could not start: one of the codes the panel explains. */
export class AgentError extends Error {
  constructor(
    public code: string,
    message = "",
  ) {
    super(message || code);
  }
}

let listening: Promise<void> | null = null;
let generation = 0;
let seq = 0;
const pending = new Map<string, { resolve: (data: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
let handler: (msg: Incoming) => void = () => undefined;

/** Where what the process sends on its own goes. */
export const onIncoming = (fn: (msg: Incoming) => void) => {
  handler = fn;
};

/** What the process said it can run, as of the last start. */
let providerStates: ProviderState[] = [];
export const providers = () => providerStates;

function receive(msg: Incoming) {
  // A line from a process that has since been replaced.
  if (typeof msg.gen === "number") {
    if (msg.gen < generation) return;
    generation = msg.gen;
  }
  switch (msg.t) {
    case "ready":
      providerStates = msg.providers ?? [];
      ready?.resolve();
      ready = null;
      return;
    case "fatal":
      ready?.reject(new AgentError(msg.code === "sdk-missing" ? "sdk-missing" : "failed", msg.message));
      ready = null;
      return;
    case "reply": {
      const waiting = pending.get(msg.id);
      if (!waiting) return;
      pending.delete(msg.id);
      clearTimeout(waiting.timer);
      if (msg.ok) waiting.resolve(msg.data);
      else waiting.reject(msg.code ? new AgentError(msg.code, msg.error ?? "") : new Error(msg.error ?? "failed"));
      return;
    }
    case "exit":
      ready?.reject(new AgentError("exited", msg.stderr));
      ready = null;
      for (const [id, waiting] of pending) {
        clearTimeout(waiting.timer);
        waiting.reject(new AgentError("exited", msg.stderr));
        pending.delete(id);
      }
      handler(msg);
      return;
    default:
      handler(msg);
  }
}

/** Starts the process if it is not running, and waits until it is ready. */
export async function connect(): Promise<void> {
  const tr = transport();
  if (!tr) throw new AgentError("unavailable");
  listening ??= tr.listen(receive).then(() => undefined);
  await listening;
  const isReady = new Promise<void>((resolve, reject) => (ready = { resolve, reject }));
  let started: { generation: number; fresh: boolean };
  try {
    started = await tr.start();
  } catch (e) {
    ready = null;
    const code = String(e);
    throw new AgentError(code === "node-missing" || code === "sidecar-missing" ? code : "failed", code);
  }
  generation = Math.max(generation, started.generation);
  if (!started.fresh) {
    ready = null;
    return;
  }
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new AgentError("timeout")), 30_000));
  await Promise.race([isReady, timeout]);
}

/** A request the process answers. */
export function request<T = unknown>(t: string, payload: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
  const tr = transport();
  if (!tr) return Promise.reject(new AgentError("unavailable"));
  const id = `q${++seq}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new AgentError("timeout"));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (data: unknown) => void, reject, timer });
    tr.send({ t, id, ...payload }).catch((e) => {
      clearTimeout(timer);
      pending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

/** A note to the process, with no reply. */
export function notify(t: string, payload: Record<string, unknown> = {}): void {
  transport()
    ?.send({ t, ...payload })
    .catch(() => undefined);
}

/** Stops the process; the next connect() starts a new one. */
export async function disconnect(): Promise<void> {
  await transport()?.stop();
}
