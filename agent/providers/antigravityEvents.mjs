// @ts-check
/**
 * The Antigravity CLI's stream, as the panel's events (src/agent/events.ts).
 *
 * In headless mode `agy` writes one JSON object per line: `init` once, then a
 * `step_update` per step of its work (the answer as it is written, each tool
 * call), then one `result` per turn. This file is the only place that knows
 * those shapes, so it is tested on fixtures of real output
 * (tests/agentAntigravity.test.ts).
 */

/** @typedef {import("../../src/agent/events").AgentEvent} AgentEvent */

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/** Statuses `agy` ends a turn with, as the panel's three. */
function endOf(/** @type {string} */ status, /** @type {string} */ error) {
  if (status === "SUCCESS") return /** @type {AgentEvent} */ ({ ev: "turn_end", status: "success" });
  if (status === "INTERRUPTED" || status === "CANCELED") return /** @type {AgentEvent} */ ({ ev: "turn_end", status: "interrupted" });
  return /** @type {AgentEvent} */ ({ ev: "turn_end", status: "error", code: `agy_${String(status || "error").toLowerCase()}`, text: error || "" });
}

/**
 * A mapper for one conversation. It keeps what a stream does not repeat: the
 * conversation's id, the tools the CLI started with, and the text of the
 * answer being written.
 * @param {{ ownsTool: (name: string, parameters?: Record<string, unknown>) => boolean }} opts
 */
export function createMapper(opts) {
  /** @type {Map<number, { text: string; open: boolean }>} */
  const steps = new Map();
  const state = {
    /** @type {string | null} */
    conversationId: null,
    /** @type {string[] | null} */
    tools: null,
    /** @type {string | null} */
    cwd: null,
    /** whether this turn has shown the person any words yet */
    sawText: false,

    /**
     * One line of the stream.
     * @param {any} line
     * @returns {AgentEvent[]}
     */
    map(line) {
      switch (line?.event) {
        case "init": {
          state.conversationId = line.conversation_id ?? state.conversationId;
          const init = line.init ?? {};
          state.tools = Array.isArray(init.tools) ? init.tools.map(String) : null;
          state.cwd = init.cwd ?? null;
          return [];
        }
        case "step_update": {
          const step = line.step_update ?? {};
          if (step.conversation_id) state.conversationId = step.conversation_id;
          const index = typeof step.step_index === "number" ? step.step_index : 0;
          const done = step.state === "DONE";
          if (step.step_type === "agent_response") {
            /** @type {AgentEvent[]} */
            const out = [];
            let here = steps.get(index);
            const delta = typeof step.text_delta === "string" ? step.text_delta : "";
            if (!here) {
              here = { text: "", open: false };
              steps.set(index, here);
            }
            if (!here.open && (delta || !done)) {
              here.open = true;
              out.push({ ev: "msg_start", messageId: `agy-${index}` }, { ev: "block_start", index, type: "text", text: "" });
            }
            if (delta) {
              here.text += delta;
              out.push({ ev: "block_delta", index, text: delta });
              state.sawText = true;
            }
            if (done) {
              if (here.open) out.push({ ev: "block_stop", index });
              if (here.text.trim()) out.push({ ev: "assistant", uuid: `agy-${index}`, messageId: `agy-${index}`, blocks: [{ type: "text", index, text: here.text }] });
              steps.delete(index);
            }
            return out;
          }
          if (step.step_type === "tool") {
            const info = step.tool_info ?? {};
            const name = String(info.name ?? step.tool_name ?? "");
            const parameters = /** @type {Record<string, unknown>} */ (info.parameters ?? {});
            // The editor's own tools are shown by the bridge, which knows the
            // call, the approval and the result; showing them again would
            // double them. The CLI reaches them through a tool of its own, so
            // what the call names matters as much as the tool does.
            if (!name || opts.ownsTool(name, parameters)) return [];
            const id = `agy-tool-${index}`;
            if (!done) {
              if (steps.has(index)) return [];
              steps.set(index, { text: "", open: false });
              return [{ ev: "assistant", uuid: id, blocks: [{ type: "tool_use", index: 0, id, name, input: parameters }] }];
            }
            steps.delete(index);
            const output = typeof info.output === "string" ? info.output : info.output ? JSON.stringify(info.output) : "";
            return [{ ev: "tool_result", toolUseId: id, text: output }];
          }
          return [];
        }
        case "result": {
          const result = line.result ?? {};
          if (result.conversation_id) state.conversationId = result.conversation_id;
          /** @type {AgentEvent[]} */
          const out = [];
          // A turn that answered without streaming a word: the reply is in the result.
          if (!state.sawText && typeof result.response === "string" && result.response.trim())
            out.push({ ev: "assistant", uuid: `agy-result-${Date.now()}`, blocks: [{ type: "text", index: 0, text: result.response }] });
          out.push(endOf(String(result.status ?? "ERROR"), String(result.error ?? "")));
          steps.clear();
          state.sawText = false;
          return out;
        }
        default:
          return [];
      }
    },
  };
  return state;
}

/**
 * The models `agy models` lists. Its output is a table meant for people, so
 * what cannot be read falls back to nothing and the editor offers the default.
 * @param {string} text
 * @returns {{ value: string; displayName: string }[]}
 */
export function parseModels(text) {
  const clean = String(text ?? "").replace(ANSI, "");
  try {
    const json = JSON.parse(clean);
    const list = Array.isArray(json) ? json : Array.isArray(json?.models) ? json.models : null;
    if (list) {
      const models = list
        .map((/** @type {any} */ m) => (typeof m === "string" ? { value: m, displayName: m } : { value: String(m.id ?? m.slug ?? m.model ?? m.name ?? ""), displayName: String(m.name ?? m.displayName ?? m.id ?? m.slug ?? m.model ?? "") }))
        .filter((m) => m.value);
      if (models.length) return models;
    }
  } catch {
    /* not JSON: a table for people */
  }
  /** @type {{ value: string; displayName: string }[]} */
  const out = [];
  for (const raw of clean.split("\n")) {
    const line = raw.replace(/^[\s*>•-]+/, "").trim();
    if (!line || /^(model|name|id|available|slug)\b/i.test(line)) continue;
    const token = line.split(/[\s|,]+/)[0];
    if (!/^[a-z][a-z0-9._-]*[0-9a-z]$/i.test(token) || !/[-.]/.test(token)) continue;
    if (!out.some((m) => m.value === token)) out.push({ value: token, displayName: token });
  }
  return out;
}

/** Whether what the CLI said on its way out means nobody is signed in. */
export const authFailure = (/** @type {string} */ text) =>
  /sign ?in|signed in|log ?in|logged in|not authenticated|unauthenticated|unauthorized|credential|oauth|keyring|re-?auth/i.test(String(text ?? ""));
