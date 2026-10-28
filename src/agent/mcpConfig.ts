/**
 * The agent's own MCP servers, as the person writes them in the preferences:
 * the text of a Claude Code `.mcp.json` (`{"mcpServers": {...}}`), or just the
 * object of servers. Parsed by the library (@edukors/ai-cli/settings), which
 * reports every problem; here they become the preferences' messages.
 */
import { parseMcpConfig as parse, type McpProblem } from "@edukors/ai-cli/settings";

/** A problem as an i18n key and its parameters. */
export interface McpMessage {
  key: string;
  params?: Record<string, string>;
}

const message = (p: McpProblem): McpMessage => ({
  key: `mcp.${p.code}`,
  params: { name: p.server ?? "", field: p.field ?? "", type: p.detail ?? "", detail: p.detail ?? "" },
});

/** The servers, and the first problem to show (the field shows one at a time, the rest follow once it is fixed). */
export function parseMcpConfig(text: string): { servers: ReturnType<typeof parse>["servers"]; problem?: McpMessage; problems: McpMessage[] } {
  const { servers, problems } = parse(text);
  const messages = problems.map(message);
  return { servers, problems: messages, ...(messages.length ? { problem: messages[0] } : {}) };
}

/** `mcp__srv__tool` → `srv › tool`; other names as they are. */
export const mcpToolName = (name: string): string => {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? `${m[1]} › ${m[2]}` : name;
};
