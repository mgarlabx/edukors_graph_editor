/**
 * The line to the agent's process, the EDUKORS AI library's host
 * (@edukors/ai-cli, `edukors-ai-host`), through the app
 * (src-tauri/src/agent.rs): one JSON object per line.
 *
 *   panel → host   { id, method, params }         a request
 *   host → panel   { id, result } | { id, error }  its answer
 *   host → panel   { event }                        a conversation's event
 *   host → panel   { login }                        a sign-in address
 *   host → panel   { id: "h:<n>", method, params }  a tool call or an authorization, answered by the panel
 *
 * The app adds `{ t: "exit" }` when the process stops and `{ t: "log" }` for a
 * line that is not JSON, and stamps every line with `gen`, the process that
 * wrote it.
 *
 * In a plain browser (`npm run dev`) there is no process to start. A test can
 * put its own transport in `window.__edukorsAgentTransport`.
 */
import type { AiEvent, LoginPrompt, SerializedError } from "@edukors/ai-cli";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../app/platform";

export type HostRequest = { id: string; method: "tool.call" | "tool.authorize"; params: Record<string, unknown> };
export type LoginMessage = LoginPrompt & { requestId: number | string; accountId: string };

export type Incoming = { gen?: number } & (
  | { ready: { protocol: number; version: string } }
  | { id: number | string; result?: unknown; error?: SerializedError; method?: undefined }
  | { event: AiEvent }
  | { login: LoginMessage }
  | HostRequest
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

const transport = (): Transport | null => (typeof window !== "undefined" && window.__edukorsAgentTransport) || (isTauri() ? tauriTransport : null);

/** An error with one of the library's stable codes (CLI_MISSING, ACCOUNT_DISCONNECTED…) or the app's own (node-missing, exited, timeout…). */
export class AgentError extends Error {
  constructor(
    public code: string,
    message = "",
    public meta?: Record<string, unknown>,
  ) {
    super(message || code);
  }
}

export interface Handlers {
  event(ev: AiEvent): void;
  login(prompt: LoginMessage): void;
  /** A tool call or an authorization: what it resolves to is the answer. */
  hostRequest(req: HostRequest): Promise<unknown>;
  exit(stderr: string): void;
}

let listening: Promise<void> | null = null;
let generation = 0;
let seq = 0;
const pending = new Map<number, { resolve: (data: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
let handlers: Handlers | null = null;

/** Where what the process sends on its own goes. */
export const setHandlers = (h: Handlers) => {
  handlers = h;
};

function receive(msg: Incoming) {
  // A line from a process that has since been replaced.
  if (typeof msg.gen === "number") {
    if (msg.gen < generation) return;
    generation = msg.gen;
  }
  if ("ready" in msg) {
    ready?.resolve();
    ready = null;
    return;
  }
  if ("event" in msg) return handlers?.event(msg.event);
  if ("login" in msg) return handlers?.login(msg.login);
  if ("t" in msg) {
    if (msg.t !== "exit") return;
    ready?.reject(new AgentError("exited", msg.stderr));
    ready = null;
    for (const [id, waiting] of pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new AgentError("exited", msg.stderr));
      pending.delete(id);
    }
    handlers?.exit(msg.stderr ?? "");
    return;
  }
  if ("method" in msg && typeof msg.method === "string") {
    const req = msg as HostRequest;
    const answer = handlers ? handlers.hostRequest(req) : Promise.reject(new Error("the editor is not listening"));
    answer.then(
      (result) => void transport()?.send({ id: req.id, result: result ?? null }).catch(() => undefined),
      (e) => void transport()?.send({ id: req.id, error: { message: e instanceof Error ? e.message : String(e) } }).catch(() => undefined),
    );
    return;
  }
  if (typeof msg.id === "number") {
    const waiting = pending.get(msg.id);
    if (!waiting) return;
    pending.delete(msg.id);
    clearTimeout(waiting.timer);
    if (msg.error) waiting.reject(new AgentError(msg.error.code, msg.error.message, msg.error.meta as Record<string, unknown> | undefined));
    else waiting.resolve(msg.result);
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

/** A request the host answers. Sign-ins and turns take as long as they take: give them a long timeout. */
export function request<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
  const tr = transport();
  if (!tr) return Promise.reject(new AgentError("unavailable"));
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new AgentError("timeout"));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (data: unknown) => void, reject, timer });
    tr.send({ id, method, params }).catch((e) => {
      clearTimeout(timer);
      pending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

/** The id of the last request sent, for `cancel`. */
export const lastRequestId = () => seq;

/** Stops the process; the next connect() starts a new one. */
export async function disconnect(): Promise<void> {
  await transport()?.stop();
}
