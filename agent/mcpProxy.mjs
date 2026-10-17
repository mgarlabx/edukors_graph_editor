// @ts-check
/**
 * The person's own MCP servers, for the providers that run as a CLI of their
 * own (Codex, Antigravity, Kiro, Kimi, OpenCode).
 *
 * Claude Code is handed the servers and connects to them itself, asking the
 * editor before each call (canUseTool). The other CLIs, in headless mode, ask
 * nobody: given a server, they would call it unchecked. So they are never
 * given one. This process connects to each server as a client, and the bridge
 * (agent/mcpBridge.mjs) serves it again at an address of its own,
 * `/mcp/<name>`, under the server's own name: the CLI sees the same server
 * and the same tools, and every call goes through the editor's gate on the
 * way, as the editor's own tools do.
 */

/** How long a server has to connect before its tools are asked for anyway. */
const LIST_WAIT_MS = 8_000;
/** How long a call may take when the server's configuration says nothing. */
const CALL_TIMEOUT_MS = 120_000;

/**
 * @typedef {{ name: string; status: "pending" | "connected" | "failed"; error?: string }} ServerState
 * @typedef {{ key: string; state: ServerState; client: any; tools: any[]; timeout: number; ready: Promise<void> }} Entry
 */

/**
 * @param {{ log: (...args: unknown[]) => void; onChange?: (states: ServerState[]) => void }} opts
 */
export function createProxy(opts) {
  /** @type {Map<string, Entry>} */
  const entries = new Map();

  const changed = () => opts.onChange?.(states());

  /** The servers' state, for the panel. */
  function states() {
    return [...entries.values()].map((e) => ({ ...e.state }));
  }

  /**
   * Connects to one server and reads its tools.
   * @param {string} name
   * @param {any} config already checked (extensions.mjs's sanitizeServers)
   * @param {Entry} entry
   */
  async function connect(name, config, entry) {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    let transport;
    if (config.type === "stdio") {
      const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
      // The same environment Claude Code would give it: the agent's, with the server's own on top.
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: /** @type {Record<string, string>} */ ({ ...process.env, ...(config.env ?? {}) }),
        stderr: "pipe",
      });
      transport.stderr?.on("data", (/** @type {Buffer} */ chunk) => opts.log(`mcp ${name}:`, String(chunk).trimEnd()));
    } else {
      const requestInit = config.headers ? { headers: config.headers } : undefined;
      const url = new URL(config.url);
      if (config.type === "sse") {
        const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
        transport = new SSEClientTransport(url, { requestInit });
      } else {
        const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        transport = new StreamableHTTPClientTransport(url, { requestInit });
      }
    }
    const client = new Client({ name: "edukors-graph-editor", version: "2.0.0" });
    client.onclose = () => {
      if (entries.get(name) !== entry || entry.state.status !== "connected") return;
      entry.state = { name, status: "failed", error: "the server closed the connection" };
      changed();
    };
    entry.client = client;
    await client.connect(transport);
    /** @type {any[]} */
    const tools = [];
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tools.push(...(page.tools ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    entry.tools = tools;
  }

  /** @param {Entry} entry */
  function drop(entry) {
    entry.state = { ...entry.state, status: "failed" };
    entry.client?.close().catch(() => undefined);
  }

  return {
    states,

    /** The names of the servers, connected or not. */
    names: () => [...entries.keys()],

    /**
     * Makes the connections match the servers given: a server that is gone or
     * changed is closed, a new one is connected. Waits for the connections up
     * to `waitMs`; one still connecting goes on in the background, and the
     * panel hears about it when it is done.
     * @param {Record<string, any>} servers
     * @param {number} [waitMs]
     */
    async sync(servers, waitMs = 15_000) {
      for (const [name, entry] of entries) {
        if (JSON.stringify(servers[name] ?? null) === entry.key) continue;
        entries.delete(name);
        drop(entry);
      }
      for (const [name, config] of Object.entries(servers)) {
        if (entries.has(name)) continue;
        /** @type {Entry} */
        const entry = { key: JSON.stringify(config), state: { name, status: "pending" }, client: null, tools: [], timeout: Number(config.timeout) || CALL_TIMEOUT_MS, ready: Promise.resolve() };
        entry.ready = connect(name, config, entry).then(
          () => {
            if (entries.get(name) !== entry) return void entry.client?.close().catch(() => undefined);
            entry.state = { name, status: "connected" };
            changed();
          },
          (e) => {
            opts.log(`mcp ${name} failed:`, e);
            entry.client?.close().catch(() => undefined);
            if (entries.get(name) !== entry) return;
            entry.state = { name, status: "failed", error: String(/** @type {Error} */ (e)?.message ?? e).slice(0, 500) };
            changed();
          },
        );
        entries.set(name, entry);
      }
      const all = Promise.all([...entries.values()].map((e) => e.ready));
      await Promise.race([all, new Promise((resolve) => setTimeout(resolve, waitMs).unref?.())]);
    },

    /**
     * A server's tools as it lists them, once it has connected; none if it is
     * not one of the person's or did not connect.
     * @param {string} name
     */
    async tools(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      if (entry.state.status === "pending") await Promise.race([entry.ready, new Promise((resolve) => setTimeout(resolve, LIST_WAIT_MS).unref?.())]);
      return entry.state.status === "connected" ? entry.tools : [];
    },

    /**
     * Calls a tool on one of the person's servers. The answer is the server's,
     * as it gave it.
     * @param {string} name
     * @param {string} tool
     * @param {Record<string, unknown>} args
     */
    async call(name, tool, args) {
      const entry = entries.get(name);
      if (!entry || entry.state.status !== "connected") throw new Error(`the MCP server "${name}" is not connected`);
      return entry.client.callTool({ name: tool, arguments: args }, undefined, { timeout: entry.timeout });
    },

    /** Closes every connection, when this process goes. */
    close() {
      for (const entry of entries.values()) drop(entry);
      entries.clear();
    },
  };
}
