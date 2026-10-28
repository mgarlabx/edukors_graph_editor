/**
 * The line to the agent's process (src/agent/client.ts), with a transport that
 * plays the app: the process takes a moment to say it is ready, as the real
 * host does while Node loads it.
 */
import { describe, expect, it } from "vitest";
import type { Incoming, Transport } from "../src/agent/client";

let running = false;
let listener: ((msg: Incoming) => void) | null = null;
let starts = 0;

const transport: Transport = {
  async start() {
    if (running) return { generation: 1, fresh: false };
    running = true;
    starts++;
    setTimeout(() => listener?.({ ready: { protocol: 1, version: "test" }, gen: 1 }), 80);
    return { generation: 1, fresh: true };
  },
  async send() {},
  async stop() {
    running = false;
  },
  async listen(cb) {
    listener = cb;
    return () => undefined;
  },
};

Object.assign(globalThis, { window: { __edukorsAgentTransport: transport } });
const { connect } = await import("../src/agent/client");

describe("agent client", () => {
  it("lets the panel and the preferences start the process at the same time, and both see it ready", async () => {
    const started = Date.now();
    // The panel opens the conversation while the preferences read the accounts.
    await Promise.all([connect(), connect(), connect()]);
    expect(starts).toBe(1);
    expect(Date.now() - started).toBeLessThan(2_000);
    // Once ready, a later call returns at once.
    await connect();
    expect(starts).toBe(1);
  });
});
