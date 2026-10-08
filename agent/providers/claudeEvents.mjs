// @ts-check
/**
 * Claude's messages, as the panel's events (src/agent/events.ts).
 *
 * Claude Code sends each block of an answer -- a thought, a text, a tool call
 * -- as a message of its own once it is complete, and, as it is written, a
 * stream of events with the text so far. This file is the only place that
 * knows those shapes: it has no provider of its own and no SDK import, so the
 * translation is tested on its own (tests/agentClaude.test.ts).
 */

/** Tool results longer than this reach the panel cut; Claude has had them whole. */
const DISPLAY_LIMIT = 20_000;

/** The errors Claude reports on a message that the panel has words for. */
const ERROR_CODES = new Set([
  "authentication_failed",
  "oauth_org_not_allowed",
  "account_on_hold",
  "billing_error",
  "rate_limit",
  "overloaded",
  "invalid_request",
  "model_not_found",
  "server_error",
  "max_output_tokens",
]);

/** @typedef {import("../../src/agent/events").AgentEvent} AgentEvent */
/** @typedef {import("../../src/agent/events").Block} Block */

/**
 * The text of a tool result, which comes as a string or as a list of blocks.
 * @param {unknown} content
 */
function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c?.type === "text" ? String(c.text ?? "") : c?.type ? `[${c.type}]` : "")).join("\n");
}

const cut = (/** @type {string} */ text) => (text.length > DISPLAY_LIMIT ? text.slice(0, DISPLAY_LIMIT) + "\n…" : text);

/**
 * The blocks of a message that the conversation shows, each with its place in
 * the message, which is what its key is made of.
 * @param {unknown} content
 * @returns {Block[]}
 */
function blocksOf(content) {
  if (!Array.isArray(content)) return [];
  /** @type {Block[]} */
  const blocks = [];
  content.forEach((raw, index) => {
    const b = /** @type {any} */ (raw ?? {});
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) blocks.push({ type: "text", index, text: b.text });
    else if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim()) blocks.push({ type: "thinking", index, text: b.thinking });
    else if (b.type === "tool_use" && b.id) blocks.push({ type: "tool_use", index, id: String(b.id), name: String(b.name ?? ""), input: b.input ?? {} });
  });
  return blocks;
}

/**
 * What a message from the person carries back: the results of the tool calls
 * and, when the turn was cut short, the note Claude Code writes in its place.
 * @param {unknown} content
 * @returns {AgentEvent[]}
 */
function userEvents(content) {
  if (!Array.isArray(content)) return [];
  /** @type {AgentEvent[]} */
  const out = [];
  for (const raw of content) {
    const b = /** @type {any} */ (raw ?? {});
    if (b.type === "tool_result" && b.tool_use_id) {
      out.push({ ev: "tool_result", toolUseId: String(b.tool_use_id), text: cut(resultText(b.content)), ...(b.is_error ? { isError: true } : {}) });
    } else if (b.type === "text" && /^\[Request interrupted/.test(String(b.text ?? ""))) {
      out.push({ ev: "interrupted" });
      return out;
    }
  }
  return out;
}

/**
 * The stream of an answer being written.
 * @param {any} event
 * @returns {AgentEvent[]}
 */
function streamEvents(event) {
  switch (event?.type) {
    case "message_start":
      return [{ ev: "msg_start", messageId: String(event.message?.id ?? "") }];
    case "content_block_start": {
      const cb = event.content_block ?? {};
      if (cb.type !== "text" && cb.type !== "thinking" && cb.type !== "tool_use") return [];
      return [
        {
          ev: "block_start",
          index: event.index,
          type: cb.type,
          text: cb.text ?? cb.thinking ?? "",
          ...(cb.id ? { id: String(cb.id) } : {}),
          ...(cb.name ? { name: String(cb.name) } : {}),
        },
      ];
    }
    case "content_block_delta": {
      const d = event.delta ?? {};
      const add = d.type === "text_delta" ? d.text : d.type === "thinking_delta" ? d.thinking : null;
      return typeof add === "string" ? [{ ev: "block_delta", index: event.index, text: add }] : [];
    }
    case "content_block_stop":
      return [{ ev: "block_stop", index: event.index }];
    default:
      return [];
  }
}

/**
 * One message from the SDK, as the events the panel needs. Most of the
 * bookkeeping Claude Code reports has no use there and comes back empty.
 * @param {any} msg
 * @returns {AgentEvent[]}
 */
export function translate(msg) {
  switch (msg?.type) {
    case "stream_event":
      return streamEvents(msg.event);
    case "assistant": {
      if (msg.parent_tool_use_id) return [];
      /** @type {AgentEvent[]} */
      const out = [{ ev: "assistant", uuid: String(msg.uuid ?? ""), messageId: msg.message?.id, blocks: blocksOf(msg.message?.content) }];
      if (msg.error && ERROR_CODES.has(msg.error)) out.push({ ev: "notice", level: "error", text: "", code: String(msg.error) });
      return out;
    }
    case "user":
      return msg.parent_tool_use_id ? [] : userEvents(msg.message?.content);
    case "result": {
      if (msg.subtype === "success") return [{ ev: "turn_end", status: "success" }];
      // Stopped by the person: not an error.
      if (typeof msg.terminal_reason === "string" && msg.terminal_reason.startsWith("aborted")) return [{ ev: "turn_end", status: "interrupted" }];
      return [{ ev: "turn_end", status: "error", code: String(msg.subtype ?? "failed"), text: Array.isArray(msg.errors) ? msg.errors.join("\n") : "" }];
    }
    case "system":
      if (msg.subtype === "compact_boundary") return [{ ev: "divider", text: "compacted" }];
      if (msg.subtype === "informational" && msg.content) return [{ ev: "notice", level: msg.level === "warning" ? "warning" : "info", text: String(msg.content) }];
      return [];
    case "rate_limit_event": {
      const info = msg.rate_limit_info ?? {};
      if (info.status === "allowed") return [];
      const when = typeof info.resetsAt === "number" ? new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1)).toISOString() : "";
      return [{ ev: "notice", level: info.status === "rejected" ? "error" : "warning", text: when, code: info.status === "rejected" ? "rate_rejected" : "rate_warning" }];
    }
    case "auth_status":
      return msg.error ? [{ ev: "notice", level: "error", text: String(msg.error), code: "authentication_failed" }] : [];
    case "conversation_reset":
      return [{ ev: "reset" }];
    default:
      return [];
  }
}

/** What Claude Code writes in a conversation's file but the panel has no use for. */
const NOT_TYPED = /^<(local-command|command-|system-reminder)/;

/**
 * A conversation read back from disk (the SDK's getSessionMessages), as the
 * same events a live one sends.
 * @param {{ type: string; uuid: string; message?: any; parent_tool_use_id?: string | null }[]} messages
 * @returns {AgentEvent[]}
 */
export function historyEvents(messages) {
  /** @type {AgentEvent[]} */
  const out = [];
  for (const entry of Array.isArray(messages) ? messages : []) {
    if (entry.parent_tool_use_id) continue;
    const message = entry.message ?? {};
    if (entry.type === "assistant") {
      out.push({ ev: "assistant", uuid: entry.uuid, messageId: message.id, blocks: blocksOf(message.content) });
    } else if (entry.type === "user") {
      const content = message.content;
      const typed =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .filter((/** @type {any} */ b) => b?.type === "text")
                .map((/** @type {any} */ b) => String(b.text ?? ""))
                .join("\n")
            : "";
      if (typed.trim() && !/^\[Request interrupted/.test(typed) && !NOT_TYPED.test(typed)) out.push({ ev: "user", key: entry.uuid, text: typed });
      out.push(...userEvents(content));
    }
  }
  return out;
}
