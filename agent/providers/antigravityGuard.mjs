// @ts-check
/**
 * The guard the Antigravity CLI runs before every tool call, as a `PreToolUse`
 * hook written into its workspace (agent/providers/antigravity.mjs).
 *
 * The CLI is given no tools of its own -- a custom agent with `tools: []` --
 * so the only one it has is the one that reaches an MCP server, and the only
 * servers it is given are on the editor's bridge: the editor's own and the
 * person's, served again there behind the editor's gate. This is the second
 * lock on that door: whatever a version of the CLI makes of that
 * configuration, a call that is not to one of them is refused here, before
 * the CLI decides anything. It is what makes `--dangerously-skip-permissions`
 * safe to pass, and that flag is what the headless CLI needs to reach the
 * editor's tools at all: it asks the person nothing, so without it every call
 * is auto-denied.
 * What approves a change to the course is the editor's own gate
 * (agent/sidecar.mjs), through the panel's cards.
 *
 * The call arrives as JSON on stdin and the answer goes out on stdout, as the
 * CLI's hooks are documented to. It takes the bridge's server names as its
 * arguments, so it needs nothing of the agent's own code.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Steps of the CLI's own working, which act on nothing outside the conversation. */
const INTERNAL = new Set(["finish", "wait", "wait_5_seconds", "ask_question", "ask_permission", "ask_custom_permission"]);

const DENIED = "This agent works only through the editor's own tools. Nothing else runs here: do the work with the editor's tools, or say in your answer what you cannot do.";

/**
 * Whether a tool call goes through the editor's bridge.
 * @param {any} call the hook's `toolCall`
 * @param {string | string[]} servers the bridge's server names
 */
export function allowed(call, servers) {
  const name = String(call?.name ?? "");
  if (name !== "call_mcp_tool") return INTERNAL.has(name);
  const args = call?.args ?? {};
  const named = args.ServerName ?? args.server_name ?? args.serverName ?? args.server;
  return typeof named === "string" && [servers].flat().includes(named);
}

// Run as the hook, not imported by a test: the call on stdin, the answer on stdout.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let call = null;
  try {
    call = JSON.parse(readFileSync(0, "utf8") || "{}")?.toolCall ?? null;
  } catch {
    /* unreadable: nothing is allowed on a call that cannot be read */
  }
  const ok = call !== null && allowed(call, process.argv.slice(2));
  process.stdout.write(JSON.stringify(ok ? { decision: "allow" } : { decision: "deny", reason: DENIED }));
}
