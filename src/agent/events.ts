/**
 * What the agent's process tells the panel, whatever runs underneath it.
 *
 * The panel used to read the Claude Agent SDK's own messages. With more than
 * one provider behind the agent (Claude Code, Antigravity, Codex), each one
 * speaks its own protocol, so the translation happens in the process
 * (agent/providers/*Events.mjs) and what crosses to the panel is this small
 * set of events: an answer being written block by block, the blocks once they
 * are complete, the result of a tool call, the end of a turn, a notice.
 *
 * transcript.ts folds them into the conversation on screen; a conversation
 * read back from disk is the same events, in the same order, without the
 * stream.
 */

/** The providers the agent can run on, in the order the menu shows them. */
export const PROVIDER_IDS = ["claude", "antigravity", "codex"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * Where each provider is installed from, for the panel to point at when it is
 * missing. Not translated: they are the official pages.
 */
export const PROVIDER_INSTALL: Record<ProviderId, string> = {
  claude: "https://claude.com/claude-code",
  antigravity: "https://antigravity.google/docs/cli/install/",
  codex: "https://developers.openai.com/codex/cli/",
};

/** A complete block of an answer. `index` is its place in the message it came in. */
export type Block =
  | { type: "text"; index: number; text: string }
  | { type: "thinking"; index: number; text: string }
  | { type: "tool_use"; index: number; id: string; name: string; input: Record<string, unknown> };

export type AgentEvent =
  /** an answer starts: what follows is written into it */
  | { ev: "msg_start"; messageId: string }
  | { ev: "block_start"; index: number; type: "text" | "thinking" | "tool_use"; text?: string; id?: string; name?: string }
  | { ev: "block_delta"; index: number; text: string }
  | { ev: "block_stop"; index: number }
  /** the blocks of an answer, complete: they replace what was being written */
  | { ev: "assistant"; uuid: string; messageId?: string; blocks: Block[] }
  | { ev: "tool_result"; toolUseId: string; text: string; isError?: boolean }
  /** the person's message, as a conversation read back from disk brings it */
  | { ev: "user"; key: string; text: string }
  | { ev: "interrupted" }
  | { ev: "turn_end"; status: "success" | "error" | "interrupted"; code?: string; text?: string }
  | { ev: "notice"; level: "info" | "warning" | "error"; text: string; code?: string }
  | { ev: "divider"; text: string }
  /** the conversation started over (Claude Code's /clear) */
  | { ev: "reset" };

/** The account the provider is signed in with. `"unknown"` when it cannot be told apart yet. */
export interface AccountInfo {
  provider: ProviderId;
  signedIn: boolean | "unknown";
  email?: string;
  /** the plan or subscription, in the provider's own words ("Claude Pro", "pro") */
  plan?: string;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  /** the model the default stands for, when the provider says which */
  resolved?: string;
  /** the effort levels this model takes, when it takes any */
  efforts?: string[];
}

export interface SessionInfo {
  id: string;
  title?: string;
  firstPrompt?: string;
  lastModified: number;
}

/** What a provider can do, so the panel only offers what is there. */
export interface Capabilities {
  /** the model takes an effort level */
  efforts: boolean;
  /** the account's usage windows can be read */
  usage: boolean;
  /** the agent can run shell commands */
  bash: boolean;
  /** the person's skills reach this provider */
  skills: boolean;
  /** the person's own MCP servers reach this provider */
  mcp: boolean;
  /** how the person signs in: in a terminal, in the browser, or not at all */
  login: "external" | "browser" | "none";
  /** the provider has questions and a plan of its own, so the editor's `ask_user` and `plan_ready` stay out */
  ownQuestions: boolean;
}

/** Whether a provider can be used on this machine, as the process reports at startup. */
export interface ProviderState {
  id: ProviderId;
  available: boolean;
  /** why not, as an i18n suffix: `missing`, `sdk-missing` */
  reason?: string;
  version?: string;
}
