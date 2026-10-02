/**
 * The conversation as the panel shows it, built from the SDK's messages.
 *
 * Claude Code sends each block of an answer -- a thought, a text, a tool call
 * -- as a message of its own once it is complete, and, as it is written, a
 * stream of events with the text so far. The stream fills `live`, which is
 * shown at the end of the conversation; each complete block replaces its live
 * copy with an item for good. A conversation read back from disk goes through
 * the same steps, without the stream.
 */
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export type ToolStatus = "running" | "done" | "error";

export type Item =
  | { kind: "user"; key: string; text: string; context?: string }
  | { kind: "text"; key: string; text: string }
  | { kind: "thinking"; key: string; text: string }
  | { kind: "tool"; key: string; id: string; name: string; input: Record<string, unknown>; status: ToolStatus; result?: string }
  | { kind: "notice"; key: string; level: "info" | "warning" | "error"; text: string; code?: string }
  | { kind: "divider"; key: string; text: string };

export interface LiveBlock {
  index: number;
  type: "text" | "thinking" | "tool_use";
  text: string;
  name?: string;
  id?: string;
  done: boolean;
}

export interface Transcript {
  items: Item[];
  /** the answer being written, block by block */
  live: { messageId: string; blocks: LiveBlock[] } | null;
}

export const emptyTranscript = (): Transcript => ({ items: [], live: null });

const CONTEXT_RE = /^\s*<editor-context>([\s\S]*?)<\/editor-context>\s*/;

/**
 * A message as the person wrote it, without the context the editor put in
 * front, and the selection that context named, as context.ts labels it.
 */
export function splitContext(text: string): { text: string; context?: string } {
  const m = CONTEXT_RE.exec(text);
  if (!m) return { text };
  const rest = text.slice(m[0].length);
  const line = /^Selected: (.+?)\.?$/m.exec(m[1])?.[1];
  if (!line) return { text: rest };
  const edge = /^the edge \d+ \((.+)\)$/.exec(line);
  if (edge) return { text: rest, context: edge[1] };
  const nodes = line.split("; ").map((part) => /^(\S+) \([^)]*\) "(.*)"$/.exec(part));
  if (nodes.length === 1 && nodes[0]) return { text: rest, context: nodes[0][2].trim() ? `${nodes[0][1]} · ${nodes[0][2].trim()}` : nodes[0][1] };
  return { text: rest, context: nodes.map((n) => n?.[1]).filter(Boolean).join(", ") || undefined };
}

/** The text of a tool result, which comes as a string or as a list of blocks. */
export function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c?.type === "text" ? String(c.text ?? "") : c?.type ? `[${c.type}]` : "")).join("\n");
}

let seq = 0;
const key = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

/** A notice in the conversation: an error, a limit reached, an interruption. */
export const notice = (level: "info" | "warning" | "error", text: string, code?: string): Item => ({ kind: "notice", key: key("n"), level, text, code });

/** The blocks of a complete assistant message, as items; the live copies of those blocks go. */
function assistantBlocks(t: Transcript, uuid: string, messageId: string | undefined, content: unknown[]): Transcript {
  const items = [...t.items];
  let live = t.live;
  content.forEach((block, i) => {
    const b = block as { type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> };
    if (b.type === "text" && b.text?.trim()) items.push({ kind: "text", key: `${uuid}:${i}`, text: b.text });
    else if (b.type === "thinking" && b.thinking?.trim()) items.push({ kind: "thinking", key: `${uuid}:${i}`, text: b.thinking });
    else if (b.type === "tool_use" && b.id && !items.some((it) => it.kind === "tool" && it.id === b.id))
      items.push({ kind: "tool", key: b.id, id: b.id, name: String(b.name ?? ""), input: b.input ?? {}, status: "running" });
    else return;
    if (live && live.messageId === messageId) {
      const at = live.blocks.findIndex((l) => l.type === b.type && (b.type !== "tool_use" || l.id === b.id));
      if (at !== -1) live = { ...live, blocks: live.blocks.filter((_, k) => k !== at) };
    }
  });
  return { items, live };
}

/**
 * What was being written when the turn stopped short, kept as it stood: an
 * interrupted answer has no complete message to replace its live copy.
 */
function freeze(t: Transcript): Transcript {
  if (!t.live?.blocks.length) return { ...t, live: null };
  const kept: Item[] = t.live.blocks
    .filter((b) => b.type !== "tool_use" && b.text.trim())
    .map((b) => (b.type === "text" ? { kind: "text", key: `${t.live!.messageId}:${b.index}`, text: b.text } : { kind: "thinking", key: `${t.live!.messageId}:${b.index}`, text: b.text }));
  return { items: [...t.items, ...kept], live: null };
}

const interrupted = (t: Transcript): Transcript => {
  const last = t.items[t.items.length - 1];
  return last?.kind === "notice" && last.code === "interrupted" ? t : { ...t, items: [...t.items, notice("info", "", "interrupted")] };
};

/** Tool results and the other things a user message can carry back. */
function userBlocks(t: Transcript, content: unknown): Transcript {
  if (!Array.isArray(content)) return t;
  let items = t.items;
  for (const block of content) {
    const b = block as { type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean; text?: string };
    if (b.type === "tool_result" && b.tool_use_id) {
      const text = resultText(b.content);
      items = items.map((it) =>
        it.kind === "tool" && it.id === b.tool_use_id ? { ...it, status: b.is_error ? "error" : "done", result: text } : it,
      );
    } else if (b.type === "text" && /^\[Request interrupted/.test(b.text ?? "")) {
      return interrupted(freeze({ ...t, items }));
    }
  }
  return { ...t, items };
}

const ERROR_CODES = new Set(["authentication_failed", "oauth_org_not_allowed", "account_on_hold", "billing_error", "rate_limit", "overloaded", "invalid_request", "model_not_found", "server_error", "max_output_tokens"]);

/** One message from the agent's process, folded into the conversation. */
export function applyMessage(t: Transcript, msg: SDKMessage): Transcript {
  const m = msg as SDKMessage & Record<string, any>;
  switch (m.type) {
    case "stream_event":
      return applyStream(t, m.event);
    case "assistant": {
      if (m.parent_tool_use_id) return t;
      const next = assistantBlocks(t, m.uuid, m.message?.id, Array.isArray(m.message?.content) ? m.message.content : []);
      return m.error && ERROR_CODES.has(m.error) ? { ...next, items: [...next.items, notice("error", "", m.error)] } : next;
    }
    case "user":
      return m.parent_tool_use_id ? t : userBlocks(t, m.message?.content);
    case "result": {
      const done = freeze(t);
      if (m.subtype === "success") return done;
      // Stopped by the person: not an error.
      if (typeof m.terminal_reason === "string" && m.terminal_reason.startsWith("aborted")) return interrupted(done);
      const text = Array.isArray(m.errors) ? m.errors.join("\n") : "";
      return { ...done, items: [...done.items, notice("error", text, m.subtype)] };
    }
    case "system":
      if (m.subtype === "compact_boundary") return { ...t, items: [...t.items, { kind: "divider", key: key("d"), text: "compacted" }] };
      if (m.subtype === "informational" && m.content) return { ...t, items: [...t.items, notice(m.level === "warning" ? "warning" : "info", String(m.content))] };
      return t;
    case "rate_limit_event": {
      const info = m.rate_limit_info ?? {};
      const when = typeof info.resetsAt === "number" ? new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1)).toISOString() : "";
      return { ...t, items: [...t.items, notice(info.status === "rejected" ? "error" : "warning", when, info.status === "rejected" ? "rate_rejected" : "rate_warning")] };
    }
    case "auth_status":
      return m.error ? { ...t, items: [...t.items, notice("error", String(m.error), "authentication_failed")] } : t;
    case "conversation_reset":
      return emptyTranscript();
    default:
      return t;
  }
}

function applyStream(t: Transcript, event: any): Transcript {
  switch (event?.type) {
    case "message_start":
      return { ...t, live: { messageId: String(event.message?.id ?? ""), blocks: [] } };
    case "content_block_start": {
      const cb = event.content_block ?? {};
      if (!t.live || !["text", "thinking", "tool_use"].includes(cb.type)) return t;
      const block: LiveBlock = { index: event.index, type: cb.type, text: cb.text ?? cb.thinking ?? "", name: cb.name, id: cb.id, done: false };
      return { ...t, live: { ...t.live, blocks: [...t.live.blocks, block] } };
    }
    case "content_block_delta": {
      const d = event.delta ?? {};
      const add = d.type === "text_delta" ? d.text : d.type === "thinking_delta" ? d.thinking : null;
      if (!t.live || typeof add !== "string") return t;
      return { ...t, live: { ...t.live, blocks: t.live.blocks.map((b) => (b.index === event.index && !b.done ? { ...b, text: b.text + add } : b)) } };
    }
    case "content_block_stop":
      if (!t.live) return t;
      return { ...t, live: { ...t.live, blocks: t.live.blocks.map((b) => (b.index === event.index ? { ...b, done: true } : b)) } };
    default:
      return t;
  }
}

/** A conversation read back from disk (getSessionMessages). */
export function fromHistory(messages: { type: string; uuid: string; message: unknown; parent_tool_use_id?: string | null }[]): Transcript {
  let t = emptyTranscript();
  for (const entry of messages) {
    if (entry.parent_tool_use_id) continue;
    const message = (entry.message ?? {}) as { content?: unknown; id?: string };
    if (entry.type === "assistant") {
      t = assistantBlocks(t, entry.uuid, message.id, Array.isArray(message.content) ? message.content : []);
    } else if (entry.type === "user") {
      const content = message.content;
      const typed = typeof content === "string" ? content : Array.isArray(content) ? content.filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("\n") : "";
      if (typed.trim() && !/^\[Request interrupted/.test(typed) && !/^<(local-command|command-|system-reminder)/.test(typed)) {
        const { text, context } = splitContext(typed);
        t = { ...t, items: [...t.items, { kind: "user", key: entry.uuid, text, ...(context ? { context } : {}) }] };
      }
      t = userBlocks(t, content);
    }
  }
  // A tool call with no result was cut short when the conversation stopped.
  return { items: t.items.map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "error" } : it)), live: null };
}

/** Tool calls left waiting when a turn ends without their results: stopped. */
export const settle = (t: Transcript): Transcript => ({
  live: null,
  items: t.items.map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "error", result: it.result ?? "" } : it)),
});
