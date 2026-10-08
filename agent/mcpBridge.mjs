// @ts-check
/**
 * The editor's tools over a local MCP server, for the providers that run as a
 * CLI of their own (Antigravity, Codex).
 *
 * Claude Code is given the tools inside its own process, by the SDK. The other
 * providers only take MCP servers, so the same tool list (agent/tools.mjs) is
 * served here over HTTP on 127.0.0.1, with a port the operating system picks
 * and a token made for this process: nothing else on the machine can call it.
 *
 * The tools are gated here, not in the CLI: in headless mode neither CLI asks
 * the person anything, so each call goes through the editor's own gate
 * (sidecar.mjs) and, when it needs approval, through the panel's cards. The
 * conversation's tool card is also born here, so what the panel shows does not
 * depend on how a CLI words its stream.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { SERVER, qualified } from "./tools.mjs";

/** Tool results longer than this reach the panel cut; the model still gets them whole. */
const DISPLAY_LIMIT = 20_000;

const cut = (/** @type {string} */ text) => (text.length > DISPLAY_LIMIT ? text.slice(0, DISPLAY_LIMIT) + "\n…" : text);

/** @param {import("./tools.mjs").ToolResult} result */
const textOf = (result) => result.content.map((c) => c.text).join("\n");

/** An answer for the model, in the shape MCP returns. */
const answer = (/** @type {string} */ text, /** @type {boolean} */ isError) => ({ content: [{ type: /** @type {const} */ ("text"), text }], isError });

/**
 * @typedef {{
 *   tools: import("./tools.mjs").ToolSpec[];
 *   callEditor: (name: string, args: Record<string, unknown>) => Promise<import("./tools.mjs").ToolResult>;
 *   gate: (tool: string, input: Record<string, unknown>, opts?: any) => Promise<{ allow: true } | { allow: false; message: string }>;
 *   askQuestions: (input: Record<string, unknown>) => Promise<{ allow: true; text: string } | { allow: false; message: string }>;
 *   askPlan: (input: Record<string, unknown>) => Promise<{ allow: true; text: string } | { allow: false; message: string }>;
 *   emit: (ev: any) => void;
 *   log: (...args: unknown[]) => void;
 * }} BridgeOptions
 */

/**
 * Starts the server. It lives as long as the agent's process.
 * @param {BridgeOptions} opts
 * @returns {Promise<{ url: string; sseUrl: string; token: string; close: () => void }>}
 */
export async function startBridge(opts) {
  const token = randomUUID().replaceAll("-", "");

  /** A server with the editor's tools on it. One serves every HTTP call; each SSE client gets its own. */
  const makeServer = () => {
    const server = new McpServer({ name: SERVER, version: "1.0.0" });
    for (const spec of opts.tools) registerOn(server, spec);
    return server;
  };

  /**
   * @param {McpServer} server
   * @param {import("./tools.mjs").ToolSpec} spec
   */
  function registerOn(server, spec) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.schema, annotations: spec.annotations },
      async (/** @type {any} */ args) => {
        const input = /** @type {Record<string, unknown>} */ (args ?? {});
        const id = randomUUID();
        // The panel shows the call before it is decided, as Claude Code's own stream does.
        opts.emit({ ev: "assistant", uuid: id, blocks: [{ type: "tool_use", index: 0, id, name: qualified(spec.name), input }] });
        const done = (/** @type {string} */ text, /** @type {boolean} */ isError) => {
          opts.emit({ ev: "tool_result", toolUseId: id, text: cut(text), ...(isError ? { isError: true } : {}) });
          return answer(text, isError);
        };
        try {
          if (spec.kind === "ask") {
            const asked = await opts.askQuestions(input);
            return asked.allow ? done(asked.text, false) : done(asked.message, true);
          }
          if (spec.kind === "plan") {
            const asked = await opts.askPlan(input);
            return asked.allow ? done(asked.text, false) : done(asked.message, true);
          }
          const verdict = await opts.gate(qualified(spec.name), input, { toolUseId: id });
          if (!verdict.allow) return done(verdict.message, true);
          const result = await opts.callEditor(spec.name, input);
          return done(textOf(result), Boolean(result.isError));
        } catch (e) {
          const message = String(/** @type {Error} */ (e)?.message ?? e);
          opts.log("tool", spec.name, "failed:", message);
          return done(`The editor could not run this tool: ${message}`, true);
        }
      },
    );
  }

  /**
   * Stateless: a server and a transport per request, which is how the SDK
   * serves a client that keeps no session, and all a CLI needs here.
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   * @param {unknown} parsed
   */
  async function serveOnce(req, res, parsed) {
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    await server.connect(transport);
    await transport.handleRequest(/** @type {any} */ (req), res, parsed);
  }

  /** The SSE clients, for a CLI that only speaks the older transport. @type {Map<string, SSEServerTransport>} */
  const sseClients = new Map();

  const authorized = (/** @type {import("node:http").IncomingMessage} */ req) => req.headers.authorization === `Bearer ${token}`;

  const http = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (!authorized(req)) {
      res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (path === "/mcp") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let parsed;
        try {
          parsed = body ? JSON.parse(body) : undefined;
        } catch {
          res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "not JSON" }));
          return;
        }
        serveOnce(req, res, parsed).catch((e) => {
          opts.log("bridge:", e);
          if (!res.headersSent) res.writeHead(500).end();
        });
      });
      return;
    }
    if (path === "/sse" && req.method === "GET") {
      const transport = new SSEServerTransport("/messages", res);
      const sse = makeServer();
      sseClients.set(transport.sessionId, transport);
      res.on("close", () => sseClients.delete(transport.sessionId));
      sse.connect(transport).catch((e) => opts.log("bridge sse:", e));
      return;
    }
    if (path === "/messages" && req.method === "POST") {
      const sessionId = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("sessionId") ?? "";
      const transport = sseClients.get(sessionId);
      if (!transport) {
        res.writeHead(404).end();
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        transport.handlePostMessage(/** @type {any} */ (req), res, body ? JSON.parse(body) : undefined).catch((e) => opts.log("bridge sse:", e));
      });
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise((resolve) => http.listen(0, "127.0.0.1", () => resolve(undefined)));
  const port = /** @type {{ port: number }} */ (http.address()).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    sseUrl: `http://127.0.0.1:${port}/sse`,
    token,
    close: () => {
      http.closeAllConnections?.();
      http.close();
    },
  };
}
