/**
 * What the panel shows about providers, accounts, models, conversations and
 * usage. The conversation's events and the providers' capabilities are the
 * library's (@edukors/ai-cli); transcript.ts folds the events into what is on
 * screen.
 */
export type { AccountInfo, AccountStatus, AiEvent, Capabilities, Detection, Usage } from "@edukors/ai-cli";

/** The providers the library runs the agent on, in the order the menus show them. */
export const PROVIDER_IDS = ["claude", "codex"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * Where each provider is installed from, for the panel to point at when it is
 * missing. Not translated: they are the official pages.
 */
export const PROVIDER_INSTALL: Record<ProviderId, string> = {
  claude: "https://claude.com/claude-code",
  codex: "https://developers.openai.com/codex/cli/",
};

/** Where Node.js, which runs the agent, is installed from. */
export const NODE_INSTALL = "https://nodejs.org/en/download";

/** A model as the composer offers it. `default` is the provider's own choice. */
export interface ModelInfo {
  value: string;
  displayName: string;
  /** the model the default stands for, when the provider says which */
  resolved?: string;
  /** the effort levels this model takes, when it takes any */
  efforts?: string[];
}

/** A conversation the editor saved, as the list shows it. */
export interface SessionInfo {
  id: string;
  title?: string;
  firstPrompt?: string;
  lastModified: number;
  accountId?: string;
}

/** One usage limit of the account: a window, the share of it used, and when it resets. */
export interface UsageLimit {
  /** the models that share it, when there is more than one group */
  group?: string;
  /** `5h`, `weekly`, or another length as the provider names it */
  window: string;
  /** the share used, 0–100 */
  percent: number;
  /** when it resets, in ms */
  resetsAt?: number;
}

/** The account's usage as last reported. */
export interface UsageReport {
  text: string;
  at: number;
  limits?: UsageLimit[];
}
