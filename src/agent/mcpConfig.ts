/**
 * The agent's own MCP servers, as the person writes them in the preferences:
 * the text of a Claude Code `.mcp.json` (`{"mcpServers": {...}}`), or just the
 * object of servers, so that what a server's documentation says to paste is
 * what goes in. Only what runs as a process (stdio) or answers at a URL (http,
 * sse) is accepted; the editor's own server keeps its name.
 */

export type McpServer =
  | { type?: "stdio"; command: string; args?: string[]; env?: Record<string, string>; timeout?: number }
  | { type: "http" | "sse"; url: string; headers?: Record<string, string>; timeout?: number };

/** What is wrong with the text, as an i18n key and its parameters. */
export interface McpProblem {
  key: string;
  params?: Record<string, string>;
}

/** The editor's own server, declared in agent/tools.mjs. */
export const RESERVED_SERVER = "edukors";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isStringMap = (v: unknown): v is Record<string, string> => isObject(v) && Object.values(v).every((x) => typeof x === "string");

function server(name: string, raw: unknown): McpServer | McpProblem {
  if (name === RESERVED_SERVER) return { key: "mcp.reserved", params: { name } };
  if (!isObject(raw)) return { key: "mcp.notObject", params: { name } };
  const timeout = typeof raw.timeout === "number" ? { timeout: raw.timeout } : {};
  const type = raw.type ?? "stdio";
  if (type === "stdio") {
    if (typeof raw.command !== "string" || !raw.command.trim()) return { key: "mcp.noCommand", params: { name } };
    if (raw.args !== undefined && !isStrings(raw.args)) return { key: "mcp.badField", params: { name, field: "args" } };
    if (raw.env !== undefined && !isStringMap(raw.env)) return { key: "mcp.badField", params: { name, field: "env" } };
    return { type: "stdio", command: raw.command, ...(raw.args ? { args: raw.args } : {}), ...(raw.env ? { env: raw.env } : {}), ...timeout };
  }
  if (type === "http" || type === "sse") {
    if (typeof raw.url !== "string" || !/^https?:\/\//.test(raw.url)) return { key: "mcp.noUrl", params: { name } };
    if (raw.headers !== undefined && !isStringMap(raw.headers)) return { key: "mcp.badField", params: { name, field: "headers" } };
    return { type, url: raw.url, ...(raw.headers ? { headers: raw.headers } : {}), ...timeout };
  }
  return { key: "mcp.badType", params: { name, type: String(type) } };
}

/** The servers in the text, or what is wrong with it. Empty text is no servers. */
export function parseMcpConfig(text: string): { servers: Record<string, McpServer>; problem?: McpProblem } {
  if (!text.trim()) return { servers: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { servers: {}, problem: { key: "mcp.notJson", params: { detail: e instanceof Error ? e.message : String(e) } } };
  }
  const list = isObject(raw) && "mcpServers" in raw ? raw.mcpServers : raw;
  if (!isObject(list)) return { servers: {}, problem: { key: "mcp.notServers" } };
  const servers: Record<string, McpServer> = {};
  for (const [name, entry] of Object.entries(list)) {
    const parsed = server(name, entry);
    if ("key" in parsed) return { servers: {}, problem: parsed };
    servers[name] = parsed;
  }
  return { servers };
}

/** `mcp__srv__tool` → `srv › tool`; other names as they are. */
export const mcpToolName = (name: string): string => {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? `${m[1]} › ${m[2]}` : name;
};
