// @ts-check
/**
 * OpenCode's server, as the panel's events (src/agent/events.ts).
 *
 * `opencode serve` sends what happens on a stream of server-sent events: a
 * message is announced (`message.updated`, which says whose it is), its parts
 * -- a text, a thought, a tool call -- come and change (`message.part.updated`)
 * while the words of one arrive a few at a time (`message.part.delta`), and
 * the session goes idle when the turn is over (`session.idle`), after an
 * error if there was one (`session.error`). This file is the only place that
 * knows those shapes (tests/agentOpencode.test.ts).
 */

/** @typedef {import("../../src/agent/events").AgentEvent} AgentEvent */

/** The effort levels the panel names; a variant of a model by another name is not offered. */
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** OpenCode's own tools, under the names the panel's cards know them by. */
const NAMES = /** @type {Record<string, string>} */ ({ bash: "Bash", webfetch: "WebFetch", websearch: "WebSearch", skill: "Skill", read: "Read", glob: "Glob", grep: "Grep" });

/** What a tool's input is called on the panel's card. */
function inputOf(/** @type {string} */ tool, /** @type {any} */ input) {
  const given = input && typeof input === "object" ? input : {};
  return tool === "skill" && given.name && !given.skill ? { ...given, skill: given.name } : given;
}

/** A tool call's name for the person, given the editor's: `edukors_read_course` is `mcp__edukors__read_course`. */
const shownName = (/** @type {string} */ tool, /** @type {(name: string) => string | null} */ qualify) => qualify(tool) ?? NAMES[tool] ?? tool;

/**
 * An error OpenCode reports, as the panel's end of a turn. The free models of
 * OpenCode Zen only answer OpenCode's own agent, which is said in so many words.
 * @param {any} error
 * @returns {AgentEvent}
 */
export function errorEnd(error) {
  const name = String(error?.name ?? "");
  if (name === "MessageAbortedError") return { ev: "turn_end", status: "interrupted" };
  const data = error?.data ?? {};
  const text = String(data.message ?? error?.message ?? name ?? "");
  const body = String(data.responseBody ?? "");
  if (/FreeTierError/.test(body) || /free tier/i.test(text)) return { ev: "turn_end", status: "error", code: "opencode_free_tier", text };
  if (name === "ProviderAuthError" || data.statusCode === 401) return { ev: "turn_end", status: "error", code: "opencode_auth", text };
  return { ev: "turn_end", status: "error", code: "opencode_error", text };
}

/**
 * A mapper for one session's stream.
 * @param {{ ownsTool: (name: string) => boolean }} opts
 */
export function createMapper(opts) {
  /** Whose each message is: only the assistant's parts are shown, the person's are already on screen. @type {Map<string, string>} */
  const roles = new Map();
  /** The parts seen, with what has been shown of them. @type {Map<string, { kind: "text" | "thinking" | "tool"; open: boolean; text: string; done: boolean }>} */
  const parts = new Map();
  /** @type {AgentEvent | null} */
  let failure = null;

  /** Closes what is still being written, at the end of a turn. */
  function closeAll() {
    /** @type {AgentEvent[]} */
    const out = [];
    for (const [id, part] of parts) {
      if (part.kind === "tool" || !part.open) continue;
      part.open = false;
      out.push({ ev: "block_stop", index: 0 });
      if (part.text.trim()) out.push({ ev: "assistant", uuid: id, messageId: id, blocks: [{ type: part.kind, index: 0, text: part.text }] });
    }
    return out;
  }

  /** A text or a thought, as it grows and once it is complete. */
  function textPart(/** @type {any} */ part, /** @type {"text" | "thinking"} */ kind) {
    /** @type {AgentEvent[]} */
    const out = [];
    const id = String(part.id ?? "");
    const text = typeof part.text === "string" ? part.text : "";
    let seen = parts.get(id);
    if (seen?.done) return out;
    if (!seen) {
      seen = { kind, open: true, text, done: false };
      parts.set(id, seen);
      out.push({ ev: "msg_start", messageId: id }, { ev: "block_start", index: 0, type: kind, text });
    } else if (text.length > seen.text.length && text.startsWith(seen.text)) {
      // A build that sends the whole text each time, and no deltas.
      out.push({ ev: "block_delta", index: 0, text: text.slice(seen.text.length) });
      seen.text = text;
    }
    if (part.time?.end) {
      seen.done = true;
      seen.open = false;
      out.push({ ev: "block_stop", index: 0 });
      const whole = text || seen.text;
      if (whole.trim()) out.push({ ev: "assistant", uuid: id, messageId: id, blocks: [{ type: kind, index: 0, text: whole }] });
    }
    return out;
  }

  /** A call to one of OpenCode's own tools. The editor's are shown by the bridge, which knows the call, the approval and the result. */
  function toolPart(/** @type {any} */ part) {
    const tool = String(part.tool ?? "");
    if (!tool || opts.ownsTool(tool)) return [];
    const id = String(part.callID || part.id || "");
    const state = part.state ?? {};
    /** @type {AgentEvent[]} */
    const out = [];
    let seen = parts.get(id);
    if (seen?.done) return out;
    if (!seen) {
      seen = { kind: "tool", open: true, text: "", done: false };
      parts.set(id, seen);
      out.push({ ev: "assistant", uuid: id, blocks: [{ type: "tool_use", index: 0, id, name: NAMES[tool] ?? tool, input: inputOf(tool, state.input) }] });
    }
    if (state.status === "completed" || state.status === "error") {
      seen.done = true;
      const failed = state.status === "error";
      out.push({ ev: "tool_result", toolUseId: id, text: String((failed ? state.error : state.output) ?? ""), ...(failed ? { isError: true } : {}) });
    }
    return out;
  }

  const state = {
    /** whether a turn is under way, so that the end of it is said once */
    inTurn: false,

    /** A turn starts: what is left of the last one goes. */
    begin() {
      state.inTurn = true;
      failure = null;
    },

    /**
     * One event of the server's stream, already known to be this session's.
     * @param {any} event
     * @returns {AgentEvent[]}
     */
    map(event) {
      const props = event?.properties ?? {};
      switch (event?.type) {
        case "message.updated": {
          const info = props.info ?? {};
          if (info.id) roles.set(String(info.id), String(info.role ?? ""));
          return [];
        }
        case "message.part.updated": {
          const part = props.part ?? {};
          if (roles.get(String(part.messageID ?? "")) !== "assistant") return [];
          if (part.type === "text") return part.synthetic || part.ignored ? [] : textPart(part, "text");
          if (part.type === "reasoning") return textPart(part, "thinking");
          if (part.type === "tool") return toolPart(part);
          return [];
        }
        case "message.part.delta": {
          const seen = parts.get(String(props.partID ?? ""));
          if (!seen || !seen.open || seen.kind === "tool" || props.field !== "text" || typeof props.delta !== "string" || !props.delta) return [];
          seen.text += props.delta;
          return [{ ev: "block_delta", index: 0, text: props.delta }];
        }
        case "session.error":
          if (state.inTurn) failure = errorEnd(props.error);
          return [];
        case "session.idle":
        case "session.status": {
          if (event.type === "session.status" && props.status?.type !== "idle") return [];
          if (!state.inTurn) return [];
          state.inTurn = false;
          const end = failure ?? { ev: "turn_end", status: "success" };
          failure = null;
          return [...closeAll(), end];
        }
        default:
          return [];
      }
    },
  };
  return state;
}

/**
 * A session read back from the server (GET /session/:id/message), as the
 * events a live one sends. The editor's own tool calls are kept here, under
 * the names the bridge gives them, since nothing else remembers them.
 * @param {any[]} messages
 * @param {{ qualify: (tool: string) => string | null }} opts
 * @returns {AgentEvent[]}
 */
export function historyEvents(messages, opts) {
  /** @type {AgentEvent[]} */
  const out = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const info = message?.info ?? {};
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    if (info.role === "user") {
      const text = parts
        .filter((/** @type {any} */ p) => p?.type === "text" && !p.synthetic && !p.ignored)
        .map((/** @type {any} */ p) => String(p.text ?? ""))
        .join("\n");
      if (text.trim()) out.push({ ev: "user", key: String(info.id ?? `u${out.length}`), text });
      continue;
    }
    if (info.role !== "assistant") continue;
    for (const part of parts) {
      const id = String(part?.id ?? "");
      if ((part?.type === "text" && !part.synthetic) || part?.type === "reasoning") {
        const text = String(part.text ?? "");
        if (text.trim()) out.push({ ev: "assistant", uuid: id, blocks: [{ type: part.type === "reasoning" ? "thinking" : "text", index: 0, text }] });
      } else if (part?.type === "tool") {
        const tool = String(part.tool ?? "");
        const state = part.state ?? {};
        const callId = String(part.callID || id);
        out.push({ ev: "assistant", uuid: callId, blocks: [{ type: "tool_use", index: 0, id: callId, name: shownName(tool, opts.qualify), input: inputOf(tool, state.input) }] });
        if (state.status === "completed") out.push({ ev: "tool_result", toolUseId: callId, text: String(state.output ?? "") });
        else if (state.status === "error") out.push({ ev: "tool_result", toolUseId: callId, text: String(state.error ?? ""), isError: true });
      }
    }
    if (info.error) {
      const end = errorEnd(info.error);
      if (end.ev === "turn_end" && end.status === "interrupted") out.push({ ev: "interrupted" });
      else if (end.ev === "turn_end") out.push({ ev: "notice", level: "error", text: end.text ?? "", ...(end.code ? { code: end.code } : {}) });
    }
  }
  return out;
}

/**
 * The providers that can answer: the ones the person connected in OpenCode
 * (`opencode auth login`, or a key in the environment). OpenCode Zen's free
 * models come connected with a public key, and they only answer OpenCode's
 * own agent, so on their own they are no account.
 * @param {any} list GET /config/providers
 */
export function usableProviders(list) {
  const providers = Array.isArray(list?.providers) ? list.providers : [];
  return providers.filter((/** @type {any} */ p) => p?.id && !(p.id === "opencode" && p.options?.apiKey === "public"));
}

/**
 * The models the panel offers, from the providers that can answer: each as
 * `provider/model`, with the effort levels its variants take, and the default
 * first, standing for the model OpenCode would pick.
 * @param {any} list GET /config/providers
 * @param {string | undefined} configured the `model` of the person's own configuration
 * @returns {{ value: string; displayName: string; resolved?: string; efforts?: string[] }[]}
 */
export function parseModels(list, configured) {
  const providers = usableProviders(list);
  if (!providers.length) return [];
  const several = providers.length > 1;
  /** @type {{ value: string; displayName: string; efforts?: string[] }[]} */
  const models = [];
  for (const p of providers) {
    for (const [key, m] of Object.entries(p.models ?? {})) {
      const model = /** @type {any} */ (m);
      if (model?.status === "deprecated") continue;
      const efforts = Object.keys(model?.variants ?? {}).filter((v) => EFFORTS.includes(v));
      const name = String(model?.name ?? key);
      models.push({ value: `${p.id}/${model?.id ?? key}`, displayName: several ? `${p.name ?? p.id} · ${name}` : name, ...(efforts.length ? { efforts } : {}) });
    }
  }
  const defaults = list?.default ?? {};
  const fallback =
    (configured && models.find((m) => m.value === configured)) ||
    providers.map((/** @type {any} */ p) => defaults[p.id] && models.find((m) => m.value === `${p.id}/${defaults[p.id]}`)).find(Boolean) ||
    models[0];
  return [{ value: "default", displayName: fallback?.displayName ?? "", ...(fallback ? { resolved: fallback.value } : {}), ...(fallback?.efforts ? { efforts: fallback.efforts } : {}) }, ...models];
}

/** A session's title, when OpenCode gave it one: the one it starts with is only a date. */
export const titleOf = (/** @type {any} */ session) => {
  const title = String(session?.title ?? "");
  return title && !/^(New session|Child session) - /.test(title) ? title : "";
};
