// @ts-check
/**
 * What the agent's process gives a provider: the editor, as far as a provider
 * needs it. Nothing here runs; it is the shape the providers are written
 * against, which agent/sidecar.mjs builds and hands to `create(host)`.
 *
 * @typedef {{
 *   cwd: string;
 *   pluginDir: string;
 *   out: (msg: Record<string, unknown>) => void;
 *   log: (...args: unknown[]) => void;
 *   ask: (payload: Record<string, unknown>, signal?: AbortSignal) => Promise<{ behavior: "allow" | "deny"; message?: string; updatedInput?: Record<string, unknown>; always?: boolean; mode?: string }>;
 *   callEditor: (name: string, args: Record<string, unknown>) => Promise<import("./tools.mjs").ToolResult>;
 *   gate: (tool: string, input: Record<string, unknown>, opts?: { toolUseId?: string; signal?: AbortSignal; reason?: string | null; blockedPath?: string | null }) => Promise<{ allow: true } | { allow: false; message: string }>;
 *   askCommand: (input: Record<string, unknown>, toolUseId?: string, signal?: AbortSignal) => Promise<{ allow: true } | { allow: false; message: string }>;
 *   askQuestions: (input: Record<string, unknown>) => Promise<{ allow: true; text: string } | { allow: false; message: string }>;
 *   askPlan: (input: Record<string, unknown>) => Promise<{ allow: true; text: string } | { allow: false; message: string }>;
 *   bridge: () => Promise<{ url: string; sseUrl: string; token: string; close: () => void }>;
 *   mode: () => "ask" | "auto" | "plan";
 *   setMode: (mode: "ask" | "auto" | "plan") => void;
 *   systemPrompt: (provider: string, instructions: unknown) => string;
 *   planInstructions: (provider: string) => string;
 *   emit: (sid: string, ev: import("../src/agent/events").AgentEvent) => void;
 *   ended: (sid: string, error?: string) => void;
 *   onExit: (fn: () => void) => void;
 * }} Host
 */
export {};
