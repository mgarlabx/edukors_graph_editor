// @ts-check
/**
 * Codex's app server, as the panel's events (src/agent/events.ts).
 *
 * A turn there is a stream of items: a message being written, a thought, a
 * command, a tool call. Each one is announced (`item/started`), filled in
 * (`item/*\/delta`) and closed (`item/completed`), and the turn ends with
 * `turn/completed`. This file is the only place that knows those shapes
 * (tests/agentCodex.test.ts).
 */

/** @typedef {import("../../src/agent/events").AgentEvent} AgentEvent */

/** The text of an item, which comes as a string or as a list of blocks. */
function textOf(/** @type {any} */ item) {
  const raw = item?.content ?? item?.text ?? item?.summary ?? item?.output ?? "";
  if (typeof raw === "string") return raw;
  if (!Array.isArray(raw)) return raw ? String(raw) : "";
  return raw
    .map((/** @type {any} */ c) => (typeof c === "string" ? c : c?.type === "text" || c?.text ? String(c.text ?? "") : c?.type ? `[${c.type}]` : ""))
    .filter(Boolean)
    .join("\n");
}

/** What a tool call is named for the person: a command is a command, whatever ran it. */
function toolName(/** @type {any} */ item) {
  switch (item?.type) {
    case "commandExecution":
      return "Bash";
    case "webSearch":
      return "WebSearch";
    case "mcpToolCall":
      return `mcp__${item.server ?? "mcp"}__${item.tool ?? ""}`;
    case "dynamicToolCall":
      return String(item.name ?? item.tool ?? "tool");
    default:
      return String(item?.type ?? "tool");
  }
}

function toolInput(/** @type {any} */ item) {
  if (item?.type === "commandExecution") {
    const command = Array.isArray(item.command) ? item.command.join(" ") : String(item.command ?? "");
    return { command, ...(item.cwd ? { cwd: String(item.cwd) } : {}) };
  }
  if (item?.type === "webSearch") return { query: String(item.query ?? "") };
  return /** @type {Record<string, unknown>} */ (item?.arguments ?? item?.input ?? {});
}

const TOOL_ITEMS = new Set(["commandExecution", "mcpToolCall", "webSearch", "dynamicToolCall"]);
const TEXT_ITEMS = new Set(["agentMessage", "reasoning"]);

/** The turn's statuses, as the panel's three. */
function endOf(/** @type {any} */ turn) {
  const status = String(turn?.status ?? "completed");
  if (status === "completed") return /** @type {AgentEvent} */ ({ ev: "turn_end", status: "success" });
  if (status === "interrupted" || status === "aborted" || status === "cancelled" || status === "canceled")
    return /** @type {AgentEvent} */ ({ ev: "turn_end", status: "interrupted" });
  return /** @type {AgentEvent} */ ({ ev: "turn_end", status: "error", code: `codex_${status}`, text: String(turn?.error?.message ?? turn?.error ?? "") });
}

/**
 * A mapper for one thread.
 * @param {{ ownsTool: (name: string) => boolean }} opts
 */
export function createMapper(opts) {
  /** The items with a block open, so a completed one knows whether to close it. @type {Set<string>} */
  const open = new Set();

  const state = {
    /** @type {string | null} */
    turnId: null,

    /**
     * One message from the app server.
     * @param {string} method
     * @param {any} params
     * @returns {AgentEvent[]}
     */
    map(method, params) {
      switch (method) {
        case "turn/started":
          state.turnId = params?.turn?.id ?? params?.turnId ?? state.turnId;
          return [];
        case "item/started": {
          const item = params?.item ?? {};
          const itemId = String(item.id ?? "");
          if (TEXT_ITEMS.has(item.type)) {
            open.add(itemId);
            return [
              { ev: "msg_start", messageId: itemId },
              { ev: "block_start", index: 0, type: item.type === "reasoning" ? "thinking" : "text", text: textOf(item) },
            ];
          }
          if (TOOL_ITEMS.has(item.type)) {
            const name = toolName(item);
            // The editor's own tools are shown by the bridge, which knows the call, the approval and the result.
            if (opts.ownsTool(name)) return [];
            return [{ ev: "assistant", uuid: itemId, blocks: [{ type: "tool_use", index: 0, id: itemId, name, input: toolInput(item) }] }];
          }
          return [];
        }
        case "item/agentMessage/delta":
        case "item/reasoning/delta": {
          const delta = params?.delta;
          const text = typeof delta === "string" ? delta : String(delta?.text ?? delta?.thinking ?? "");
          return text ? [{ ev: "block_delta", index: 0, text }] : [];
        }
        case "item/completed": {
          const item = params?.item ?? {};
          const itemId = String(item.id ?? "");
          if (TEXT_ITEMS.has(item.type)) {
            /** @type {AgentEvent[]} */
            const out = [];
            if (open.delete(itemId)) out.push({ ev: "block_stop", index: 0 });
            const text = textOf(item);
            if (text.trim())
              out.push({
                ev: "assistant",
                uuid: itemId,
                messageId: itemId,
                blocks: [{ type: item.type === "reasoning" ? "thinking" : "text", index: 0, text }],
              });
            return out;
          }
          if (TOOL_ITEMS.has(item.type)) {
            if (opts.ownsTool(toolName(item))) return [];
            const failed = item.status && item.status !== "completed" && item.status !== "succeeded";
            return [{ ev: "tool_result", toolUseId: itemId, text: textOf(item) || (failed ? String(item.status) : ""), ...(failed ? { isError: true } : {}) }];
          }
          // A change to a file should never get this far: the editor denies them.
          if (item.type === "fileChange") return [{ ev: "notice", level: "warning", text: textOf(item), code: "codex_file_change" }];
          return [];
        }
        case "turn/completed":
          state.turnId = null;
          open.clear();
          return [endOf(params?.turn ?? {})];
        case "turn/failed":
          state.turnId = null;
          open.clear();
          return [{ ev: "turn_end", status: "error", code: "codex_failed", text: String(params?.error?.message ?? params?.error ?? "") }];
        default:
          return [];
      }
    },
  };
  return state;
}

/**
 * A thread read back from the app server (thread/read), as the same events a
 * live one sends.
 * @param {any} thread
 * @param {{ ownsTool: (name: string) => boolean }} opts
 * @returns {AgentEvent[]}
 */
export function historyEvents(thread, opts) {
  /** @type {AgentEvent[]} */
  const out = [];
  for (const turn of thread?.turns ?? []) {
    for (const item of turn?.items ?? []) {
      const itemId = String(item?.id ?? "");
      if (item?.type === "userMessage") {
        const text = textOf(item);
        if (text.trim()) out.push({ ev: "user", key: itemId || `u${out.length}`, text });
      } else if (TEXT_ITEMS.has(item?.type)) {
        const text = textOf(item);
        if (text.trim()) out.push({ ev: "assistant", uuid: itemId, blocks: [{ type: item.type === "reasoning" ? "thinking" : "text", index: 0, text }] });
      } else if (TOOL_ITEMS.has(item?.type)) {
        const name = toolName(item);
        if (opts.ownsTool(name)) continue;
        const failed = item.status && item.status !== "completed" && item.status !== "succeeded";
        out.push({ ev: "assistant", uuid: itemId, blocks: [{ type: "tool_use", index: 0, id: itemId, name, input: toolInput(item) }] });
        out.push({ ev: "tool_result", toolUseId: itemId, text: textOf(item), ...(failed ? { isError: true } : {}) });
      }
    }
  }
  return out;
}

/**
 * The questions Codex asks the person (item/tool/requestUserInput), in the
 * shape the panel's question card reads (the `ask_user` tool's). Codex gives
 * each question an id, a header and the question itself; the card is keyed by
 * the question's words, which is what the answers come back under.
 * @param {any} params
 */
export function mapQuestions(params) {
  const questions = (Array.isArray(params?.questions) ? params.questions : [])
    .map((/** @type {any} */ q) => ({
      question: String(q?.question ?? q?.description ?? q?.prompt ?? q?.title ?? ""),
      ...(q?.header || q?.title ? { header: String(q.header ?? q.title) } : {}),
      options: (Array.isArray(q?.options) ? q.options : [])
        .map((/** @type {any} */ o) =>
          typeof o === "string" ? { label: o } : { label: String(o?.label ?? o?.title ?? o?.value ?? ""), ...(o?.description ? { description: String(o.description) } : {}) },
        )
        .filter((/** @type {{ label: string }} */ o) => o.label),
    }))
    .filter((/** @type {{ question: string }} */ q) => q.question);
  return { questions };
}

/**
 * The person's answers, as Codex takes them back: one entry per question id,
 * each with the answers given to it.
 * @param {any} params the request Codex sent
 * @param {Record<string, string>} answers the card's answers, by the question's words
 */
export function answersFrom(params, answers) {
  const questions = Array.isArray(params?.questions) ? params.questions : [];
  /** @type {Record<string, { answers: string[] }>} */
  const out = {};
  for (const q of questions) {
    const text = String(q?.question ?? q?.description ?? q?.prompt ?? q?.title ?? "");
    const given = String(answers?.[text] ?? "").trim();
    out[String(q?.id ?? text)] = { answers: given ? [given] : [] };
  }
  return { answers: out };
}
