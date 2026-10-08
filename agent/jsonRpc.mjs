// @ts-check
/**
 * JSON-RPC over a child process's pipes, one message per line.
 *
 * Codex's app server speaks this (`codex app-server`), and leaves the
 * `"jsonrpc": "2.0"` field off its messages, so this reader accepts a message
 * with or without it and writes them the same way. It carries three kinds of
 * traffic: what the editor asks and waits for, what the server tells it
 * without being asked, and what the server asks the editor (an approval, a
 * question for the person), which must be answered by the same id.
 */
import { createInterface } from "node:readline";

/** How long a request waits before it is given up on. */
const TIMEOUT_MS = 120_000;

/**
 * @param {import("node:child_process").ChildProcessWithoutNullStreams} child
 * @param {{
 *   onNotification?: (method: string, params: any) => void;
 *   onRequest?: (method: string, params: any) => Promise<unknown>;
 *   log?: (...args: unknown[]) => void;
 * }} handlers
 */
export function attach(child, handlers = {}) {
  const log = handlers.log ?? (() => undefined);
  /** @type {Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>} */
  const pending = new Map();
  let nextId = 1;
  let closed = false;

  const write = (/** @type {Record<string, unknown>} */ msg) => {
    if (closed || child.exitCode !== null) throw new Error("the app server is not running");
    child.stdin.write(JSON.stringify(msg) + "\n");
  };

  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log("not JSON-RPC:", line.slice(0, 300));
      return;
    }
    const hasId = msg.id !== undefined && msg.id !== null;
    if (hasId && typeof msg.method === "string") {
      // The server is asking: it waits for an answer under the same id.
      const answer = handlers.onRequest?.(msg.method, msg.params ?? {});
      Promise.resolve(answer ?? Promise.reject(new Error(`unhandled request: ${msg.method}`)))
        .then((result) => write({ id: msg.id, result: result ?? null }))
        .catch((e) => {
          log("request", msg.method, "failed:", e);
          try {
            write({ id: msg.id, error: { code: -32603, message: String(e?.message ?? e) } });
          } catch {
            /* the server went */
          }
        });
      return;
    }
    if (hasId) {
      const waiting = pending.get(msg.id);
      if (!waiting) return;
      pending.delete(msg.id);
      clearTimeout(waiting.timer);
      if (msg.error) waiting.reject(new Error(msg.error.message ? String(msg.error.message) : JSON.stringify(msg.error)));
      else waiting.resolve(msg.result ?? null);
      return;
    }
    if (typeof msg.method === "string") handlers.onNotification?.(msg.method, msg.params ?? {});
  });

  const fail = (/** @type {string} */ why) => {
    closed = true;
    for (const [id, waiting] of pending) {
      pending.delete(id);
      clearTimeout(waiting.timer);
      waiting.reject(new Error(why));
    }
  };
  child.on("exit", () => fail("the app server stopped"));

  return {
    /**
     * @param {string} method
     * @param {Record<string, unknown>} [params]
     * @param {number} [timeout]
     * @returns {Promise<any>}
     */
    request(method, params = {}, timeout = TIMEOUT_MS) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} did not answer in time`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        try {
          write({ id, method, params });
        } catch (e) {
          pending.delete(id);
          clearTimeout(timer);
          reject(/** @type {Error} */ (e));
        }
      });
    },

    /** @param {string} method @param {Record<string, unknown>} [params] */
    notify(method, params = {}) {
      try {
        write({ method, params });
      } catch (e) {
        log("notify", method, "failed:", e);
      }
    },

    close() {
      fail("closed");
      try {
        child.stdin.end();
      } catch {
        /* already gone */
      }
    },
  };
}
