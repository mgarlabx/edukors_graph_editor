// @ts-check
/**
 * The Agent Client Protocol, as the panel's events (src/agent/events.ts).
 *
 * Kiro and Kimi speak ACP (`kiro-cli acp`, `kimi acp`), the protocol Zed and
 * the JetBrains IDEs drive coding agents with: the agent tells what happens in
 * a turn with `session/update` notifications -- the answer a few words at a
 * time (`agent_message_chunk`), its thinking (`agent_thought_chunk`), each
 * tool call (`tool_call`) and what became of it (`tool_call_update`) -- and
 * the turn ends when the `session/prompt` request it started is answered,
 * with the reason it stopped. This file is the only place that knows those
 * shapes (tests/agentAcp.test.ts).
 */

/** @typedef {import("../../src/agent/events").AgentEvent} AgentEvent */

/** The effort levels the panel names; a level by another name is not offered. */
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** ACP's kinds of tool, under the names the panel's cards know them by. */
const NAMES = /** @type {Record<string, string>} */ ({ execute: "Bash", fetch: "WebFetch", read: "Read", search: "Grep" });

/** The text of a content block, or of a list of them, as ACP nests them. @param {any} content @returns {string} */
export function textOf(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(textOf).filter(Boolean).join("\n");
  if (content.type === "text") return String(content.text ?? "");
  // A tool call's content: { type: "content", content: <block> }, or a diff, or a terminal.
  if (content.type === "content") return textOf(content.content);
  if (content.type === "diff") return String(content.path ?? "");
  if (content.type === "resource") return String(content.resource?.text ?? "");
  return "";
}

/** A tool call's name for the person. @param {any} call */
export const toolName = (call) => NAMES[String(call?.kind ?? "")] ?? (String(call?.title ?? "").trim() || "Tool");

/**
 * A tool call's input for the person: what the agent passed, which may come
 * only later in `rawInput` and is often written out as the call's content
 * first, or at least its title.
 * @param {any} call
 * @returns {Record<string, unknown>}
 */
export function toolInput(call) {
  const isObject = (/** @type {unknown} */ v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  if (isObject(call?.rawInput)) return call.rawInput;
  try {
    const parsed = JSON.parse(textOf(call?.content));
    if (isObject(parsed)) return parsed;
  } catch {
    /* not the input written out */
  }
  return { description: String(call?.title ?? "") };
}

/**
 * Why a turn stopped, as the panel's end of it. Reaching the agent's own limit
 * of tokens or of requests is an end like any other: the answer is on screen.
 * @param {string} reason
 * @param {string} provider
 * @returns {AgentEvent}
 */
export function endOf(reason, provider) {
  if (reason === "cancelled") return { ev: "turn_end", status: "interrupted" };
  if (reason === "refusal") return { ev: "turn_end", status: "error", code: "acp_refusal", text: "" };
  if (reason === "end_turn" || reason === "max_tokens" || reason === "max_turn_requests" || !reason) return { ev: "turn_end", status: "success" };
  return { ev: "turn_end", status: "error", code: `${provider}_error`, text: reason };
}

/**
 * A mapper for one conversation. It keeps what a stream does not repeat: the
 * text or thought being written, and the tool calls the person has been shown.
 * @param {{ ownsTool: (call: any) => boolean; prefix: string }} opts
 */
export function createMapper(opts) {
  /** What is being written now. @type {{ id: string; kind: "text" | "thinking"; text: string } | null} */
  let open = null;
  /** The tool calls shown, by id; the editor's own are left to the bridge. @type {Map<string, { shown: boolean; done: boolean }>} */
  const calls = new Map();
  let serial = 0;

  /** Ends what is being written, as a complete block. @returns {AgentEvent[]} */
  function close() {
    if (!open) return [];
    const done = open;
    open = null;
    /** @type {AgentEvent[]} */
    const out = [{ ev: "block_stop", index: 0 }];
    if (done.text.trim()) out.push({ ev: "assistant", uuid: done.id, messageId: done.id, blocks: [{ type: done.kind, index: 0, text: done.text }] });
    return out;
  }

  /** A few more words of an answer or a thought. @param {"text" | "thinking"} kind @param {string} text @returns {AgentEvent[]} */
  function write(kind, text) {
    if (!text) return [];
    /** @type {AgentEvent[]} */
    const out = [];
    if (open && open.kind !== kind) out.push(...close());
    if (!open) {
      open = { id: `${opts.prefix}-${++serial}`, kind, text: "" };
      out.push({ ev: "msg_start", messageId: open.id }, { ev: "block_start", index: 0, type: kind, text: "" });
    }
    open.text += text;
    out.push({ ev: "block_delta", index: 0, text });
    return out;
  }

  /** What became of a tool call, once it is through. @param {any} update @returns {AgentEvent[]} */
  function settle(update) {
    const id = String(update.toolCallId ?? "");
    const seen = calls.get(id);
    if (!seen?.shown || seen.done) return [];
    if (update.status !== "completed" && update.status !== "failed") return [];
    seen.done = true;
    const raw = update.rawOutput;
    const text = textOf(update.content) || (typeof raw === "string" ? raw : raw != null ? JSON.stringify(raw) : "");
    return [{ ev: "tool_result", toolUseId: id, text, ...(update.status === "failed" ? { isError: true } : {}) }];
  }

  return {
    /**
     * One `session/update`'s `update`.
     * @param {any} update
     * @returns {AgentEvent[]}
     */
    map(update) {
      switch (update?.sessionUpdate) {
        case "agent_message_chunk":
          return write("text", textOf(update.content));
        case "agent_thought_chunk":
          return write("thinking", textOf(update.content));
        case "tool_call": {
          const id = String(update.toolCallId ?? "");
          if (!id || calls.has(id)) return settle(update);
          // The editor's own tools, and the person's servers, are shown by the
          // bridge, which knows the call, the approval and the result; showing
          // them again would double them.
          const shown = !opts.ownsTool(update);
          calls.set(id, { shown, done: false });
          // What was being written is through: the call comes after it, whoever shows the call.
          if (!shown) return close();
          return [...close(), { ev: "assistant", uuid: id, blocks: [{ type: "tool_use", index: 0, id, name: toolName(update), input: toolInput(update) }] }, ...settle(update)];
        }
        case "tool_call_update":
          return settle(update);
        default:
          return [];
      }
    },

    /** The end of a turn, with the reason the agent gave. @param {string} reason @param {string} provider */
    end(reason, provider) {
      /** @type {AgentEvent[]} */
      const out = [...close()];
      // A call the agent never said was through is through now.
      for (const [id, call] of calls) if (call.shown && !call.done) out.push({ ev: "tool_result", toolUseId: id, text: "" });
      calls.clear();
      out.push(endOf(reason, provider));
      return out;
    },
  };
}

/**
 * The models and effort levels a session offers, from what `session/new` (or
 * `session/load`) answered: the configuration options of current ACP, or the
 * older `models` list, whichever the agent sends. The default stands for the
 * model the agent picked.
 * @param {any} session
 * @returns {{ models: { value: string; displayName: string; resolved?: string; efforts?: string[] }[]; modelOption: string | null; effortOption: string | null }}
 */
export function sessionModels(session) {
  const options = Array.isArray(session?.configOptions) ? session.configOptions : [];
  const flat = (/** @type {any[]} */ list) =>
    list.flatMap((/** @type {any} */ o) => (Array.isArray(o?.options) ? o.options : [o])).filter((/** @type {any} */ o) => o && o.value != null);
  const modelOpt = options.find((/** @type {any} */ o) => o?.category === "model" || o?.id === "model");
  const effortOpt = options.find((/** @type {any} */ o) => o?.category === "thought_level" || o?.id === "effort" || o?.id === "thinking");
  const efforts = effortOpt ? flat(effortOpt.options ?? []).map((/** @type {any} */ o) => String(o.value)).filter((/** @type {string} */ v) => EFFORTS.includes(v)) : [];
  /** @type {{ value: string; displayName: string }[]} */
  let list = [];
  /** @type {string | undefined} */
  let current;
  if (modelOpt) {
    list = flat(modelOpt.options ?? []).map((/** @type {any} */ o) => ({ value: String(o.value), displayName: String(o.name ?? o.value) }));
    current = modelOpt.currentValue != null ? String(modelOpt.currentValue) : undefined;
  } else if (Array.isArray(session?.models?.availableModels)) {
    list = session.models.availableModels.map((/** @type {any} */ m) => ({ value: String(m.modelId ?? ""), displayName: String(m.name ?? m.modelId ?? "") })).filter((/** @type {any} */ m) => m.value);
    current = session.models.currentModelId != null ? String(session.models.currentModelId) : undefined;
  }
  const withEfforts = (/** @type {any} */ m) => (efforts.length ? { ...m, efforts } : m);
  const picked = list.find((m) => m.value === current);
  return {
    models: [withEfforts({ value: "default", displayName: picked?.displayName ?? "", ...(current ? { resolved: current } : {}) }), ...list.map(withEfforts)],
    modelOption: modelOpt ? String(modelOpt.id) : null,
    effortOption: efforts.length ? String(effortOpt.id) : null,
  };
}

/** Whether an error from the agent, or what it said on its way out, means nobody is signed in. */
export const authFailure = (/** @type {string} */ text) =>
  /auth(entication)? required|not logged in|log ?in|logged in|sign ?in|not authenticated|unauthenticated|unauthorized|credential/i.test(String(text ?? ""));
