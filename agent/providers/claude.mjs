// @ts-check
/**
 * The agent on Claude Code, through the Claude Agent SDK.
 *
 * Claude Code, which the SDK runs underneath, authenticates with the Claude
 * account logged in on this Mac (`claude` → /login). API keys from the
 * environment are removed so that the account is what gets used.
 *
 * One conversation is open at a time. It runs in streaming input mode: the
 * process stays up between messages, so the person can write while Claude
 * works, interrupt it, and change the model or the mode as it goes.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as tools from "../tools.mjs";
import * as ext from "../extensions.mjs";
import { openTerminal } from "../terminal.mjs";
import { historyEvents, translate } from "./claudeEvents.mjs";

export const id = "claude";

export const capabilities = { efforts: true, usage: true, bash: true, skills: true, mcp: true, login: "external", ownQuestions: true };

/** @type {any} */
let sdk = null;

/** The SDK, imported the first time it is needed: the app runs without it, on another provider. */
async function load() {
  if (!sdk) sdk = await import("@anthropic-ai/claude-agent-sdk");
  return sdk;
}

function sdkVersion() {
  try {
    const entry = fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk"));
    return JSON.parse(readFileSync(join(dirname(entry), "package.json"), "utf8")).version;
  } catch {
    return undefined;
  }
}

export async function detect() {
  try {
    await load();
    return { available: true, version: sdkVersion() };
  } catch (e) {
    return { available: false, reason: "sdk-missing", detail: String(/** @type {Error} */ (e)?.message ?? e) };
  }
}

/** The environment Claude Code runs in: the logged-in account, nothing from the person's own Claude Code setup. */
function claudeEnv() {
  /** @type {Record<string, string | undefined>} */
  const env = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: "edukors-graph-editor",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CODE_ENABLE_TASKS: "0",
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    MAX_MCP_OUTPUT_TOKENS: "60000",
  };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

/** How long the panel hears about servers still connecting, after a conversation opens. */
const MCP_WATCH_MS = 60_000;

/**
 * @param {import("../host").Host} host
 */
export function create(host) {
  /** The editor's tools, as an in-process MCP server of the SDK. */
  let server = null;

  /** @type {{ id: string; q: any; inbox: Inbox; live: boolean; ended: Promise<void> } | null} */
  let current = null;

  /**
   * Conversations closed and still shutting down: Claude Code writes the last
   * lines of a conversation's file (its title, its cost) as it stops, so a
   * conversation is deleted only once it has stopped -- else the file comes back.
   * @type {Map<string, Promise<void>>}
   */
  const stopping = new Map();

  /** The prompt of a streaming query: an async iterable that yields each message the person sends, and waits in between. */
  class Inbox {
    /** @type {any[]} */
    items = [];
    /** @type {((r: IteratorResult<any>) => void)[]} */
    waiting = [];
    closed = false;

    /** @param {any} msg */
    push(msg) {
      const next = this.waiting.shift();
      if (next) next({ value: msg, done: false });
      else this.items.push(msg);
    }

    close() {
      this.closed = true;
      for (const next of this.waiting.splice(0)) next({ value: undefined, done: true });
    }

    [Symbol.asyncIterator]() {
      return {
        next: () => {
          const item = this.items.shift();
          if (item) return Promise.resolve({ value: item, done: false });
          if (this.closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => this.waiting.push(resolve));
        },
      };
    }
  }

  const editorServer = async () => {
    if (server) return server;
    const { createSdkMcpServer, tool } = await load();
    server = createSdkMcpServer({
      name: tools.SERVER,
      version: "1.0.0",
      tools: tools.toolsFor(false).map((spec) =>
        tool(spec.name, spec.description, spec.schema, (/** @type {any} */ args) => host.callEditor(spec.name, args), {
          annotations: spec.annotations,
          alwaysLoad: true,
        }),
      ),
    });
    return server;
  };

  const sdkMode = () => (host.mode() === "plan" ? "plan" : "default");

  /**
   * Decides on a tool call that nothing approved beforehand. The editor's own
   * gate answers for the course tools and the ones that reach outside; the
   * questions and the plan are Claude Code's own tools, with cards of their own.
   * @returns {any}
   */
  const decide = () => async (/** @type {string} */ toolName, /** @type {any} */ input, /** @type {any} */ options) => {
    const base = { tool: toolName, input, toolUseId: options.toolUseID, reason: options.decisionReason ?? null, blockedPath: options.blockedPath ?? null };
    if (toolName === "AskUserQuestion") {
      const answer = await host.ask({ ...base, kind: "question" }, options.signal);
      return answer.behavior === "allow"
        ? { behavior: "allow", updatedInput: answer.updatedInput ?? input }
        : { behavior: "deny", message: answer.message ?? "The person did not answer." };
    }
    if (toolName === "ExitPlanMode") {
      const answer = await host.ask({ ...base, kind: "plan" }, options.signal);
      if (answer.behavior !== "allow") return { behavior: "deny", message: answer.message ?? "The person wants to keep planning." };
      host.setMode(answer.mode === "auto" ? "auto" : "ask");
      return { behavior: "allow", updatedInput: input };
    }
    // Commands are decided before this, by commandGate; one that still got here is asked about the same way.
    if (toolName === "Bash") {
      const verdict = await host.askCommand(input, options.toolUseID, options.signal);
      return verdict.allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: verdict.message };
    }
    const verdict = await host.gate(toolName, input, { toolUseId: options.toolUseID, signal: options.signal, reason: options.decisionReason ?? null, blockedPath: options.blockedPath ?? null });
    return verdict.allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: verdict.message };
  };

  /**
   * A command can do anything on the Mac, so each one is put to the person.
   * Claude Code runs the ones it deems read-only without consulting canUseTool;
   * a hook before the tool sees them all.
   * @returns {any}
   */
  const commandGate = () => async (/** @type {any} */ hookInput, /** @type {string | undefined} */ toolUseId, /** @type {any} */ { signal }) => {
    if (hookInput.hook_event_name !== "PreToolUse" || hookInput.tool_name !== "Bash") return {};
    const input = hookInput.tool_input ?? {};
    const verdict = await host.askCommand(input, toolUseId ?? hookInput.tool_use_id, signal);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdict.allow ? "allow" : "deny",
        ...(verdict.allow ? {} : { permissionDecisionReason: verdict.message }),
      },
    };
  };

  /** Passes the conversation's messages on, as events, until Claude Code stops. */
  async function pump(/** @type {any} */ conv) {
    try {
      for await (const msg of conv.q) {
        if (!conv.live) continue;
        for (const ev of translate(msg)) host.emit(conv.id, ev);
      }
      if (conv.live) host.ended(conv.id);
    } catch (e) {
      if (conv.live) host.ended(conv.id, String(/** @type {Error} */ (e)?.message ?? e));
    } finally {
      if (current === conv) current = null;
    }
  }

  async function mcpStates(/** @type {any} */ conv) {
    try {
      return ext.serverStates(await conv.q.mcpServerStatus(), tools.SERVER);
    } catch (e) {
      host.log("MCP status:", e);
      return [];
    }
  }

  /**
   * The person's servers connect after the conversation opens: their state goes
   * to the panel as it changes, until none is still connecting.
   */
  async function watchServers(/** @type {any} */ conv, /** @type {{ name: string; status: string }[]} */ last) {
    const until = Date.now() + MCP_WATCH_MS;
    let seen = JSON.stringify(last);
    while (conv.live && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 500));
      if (!conv.live) return;
      const now = await mcpStates(conv);
      const text = JSON.stringify(now);
      if (text !== seen) {
        seen = text;
        host.out({ t: "mcp", sid: conv.id, servers: now });
      }
      if (!now.some((s) => s.status === "pending")) return;
    }
  }

  /** Closes the conversation on screen. Resolves once it has stopped. */
  function close() {
    const conv = current;
    if (!conv) return Promise.resolve();
    current = null;
    conv.live = false;
    const ended = conv.ended.finally(() => stopping.delete(conv.id));
    stopping.set(conv.id, ended);
    conv.inbox.close();
    try {
      conv.q.close();
    } catch (e) {
      host.log("close:", e);
    }
    return ended;
  }

  /** @type {Promise<{ text: string; at: number }> | null} */
  let usageRun = null;

  return {
    capabilities,

    /**
     * Opens a conversation: a new one, or one from the list, resumed. The
     * Claude Code process starts and initializes now, before any message, so the
     * panel learns the account and the models at once and the first message
     * does not wait for the start.
     * @param {any} opts
     */
    async open(opts) {
      const api = await load();
      await close();
      // A conversation reopened while it is still stopping: one Claude Code at a time on its file.
      const previous = opts.resume ? stopping.get(opts.resume) : undefined;
      if (previous) await Promise.race([previous, new Promise((r) => setTimeout(r, 10_000))]);
      const sid = opts.resume ?? randomUUID();
      const inbox = new Inbox();
      const model = opts.model && opts.model !== "default" ? opts.model : undefined;
      const effort = opts.effort && opts.effort !== "auto" ? opts.effort : undefined;
      const skills = ext.listSkills(host.pluginDir, host.log);
      const { servers, dropped } = ext.sanitizeServers(opts.mcp, tools.SERVER);
      if (dropped.length) host.log("MCP servers left out:", dropped.join(", "));

      const conv = { id: sid, q: /** @type {any} */ (null), inbox, live: true, ended: Promise.resolve() };
      conv.q = api.query({
        prompt: inbox,
        options: {
          cwd: host.cwd,
          ...(opts.resume ? { resume: opts.resume } : { sessionId: sid }),
          model,
          effort,
          permissionMode: sdkMode(),
          planModeInstructions: host.planInstructions(id),
          systemPrompt: host.systemPrompt(id, opts.instructions),
          tools: ["Read", "Glob", "Grep", "Bash", "WebSearch", "WebFetch", "AskUserQuestion", "TodoWrite", "ExitPlanMode", ...(skills.length ? ["Skill"] : [])],
          // Loading a skill only reads its instructions; what it then does is asked about as usual.
          allowedTools: [...tools.FREE_TOOLS, "TodoWrite", ...(skills.length ? ["Skill"] : [])],
          mcpServers: { ...servers, [tools.SERVER]: await editorServer() },
          strictMcpConfig: true,
          settingSources: [],
          ...(skills.length ? { plugins: [{ type: "local", path: host.pluginDir }], skills: ext.skillIds(skills) } : {}),
          canUseTool: decide(),
          hooks: { PreToolUse: [{ matcher: "Bash", hooks: [commandGate()] }] },
          includePartialMessages: true,
          thinking: { type: "adaptive", display: "summarized" },
          env: claudeEnv(),
          stderr: (/** @type {string} */ text) => host.log("claude:", text.trimEnd()),
        },
      });
      current = conv;
      conv.ended = pump(conv);
      const init = await conv.q.initializationResult();
      const mcp = await mcpStates(conv);
      if (mcp.some((s) => s.status === "pending")) watchServers(conv, mcp);
      const account = init.account ?? null;
      return {
        sessionId: sid,
        resumed: Boolean(opts.resume),
        account: {
          provider: id,
          signedIn: Boolean(account?.email || account?.subscriptionType || account?.apiKeySource || account?.tokenSource),
          ...(account?.email ? { email: account.email } : {}),
          ...(account?.subscriptionType ? { plan: account.subscriptionType } : {}),
        },
        models: (init.models ?? []).map((/** @type {any} */ m) => ({
          value: m.value,
          displayName: m.displayName ?? m.value,
          ...(m.resolvedModel ? { resolved: m.resolvedModel } : {}),
          ...(m.supportedEffortLevels?.length ? { efforts: m.supportedEffortLevels } : {}),
        })),
        mcp,
        skills,
      };
    },

    /** @param {string} text @param {string} [uuid] */
    send(text, uuid) {
      if (!current) throw new Error("no conversation open");
      current.inbox.push({
        type: "user",
        uuid: uuid ?? randomUUID(),
        session_id: current.id,
        parent_tool_use_id: null,
        message: { role: "user", content: text },
      });
      return { sessionId: current.id };
    },

    async interrupt() {
      if (current) await current.q.interrupt();
    },

    /** @param {{ mode?: string; model?: string; effort?: string }} req */
    async set(req) {
      const conv = current;
      if (!conv) return;
      if (req.mode) await conv.q.setPermissionMode(sdkMode());
      if (req.model) await conv.q.setModel(req.model === "default" ? undefined : req.model);
      if (req.effort) await conv.q.applyFlagSettings({ effortLevel: req.effort === "auto" ? null : req.effort });
    },

    close,

    async list() {
      const api = await load();
      const sessions = await api.listSessions({ dir: host.cwd, limit: 200 });
      return sessions.map((/** @type {any} */ s) => ({
        id: s.sessionId,
        ...(s.customTitle || s.summary ? { title: s.customTitle || s.summary } : {}),
        ...(s.firstPrompt ? { firstPrompt: s.firstPrompt } : {}),
        lastModified: s.lastModified,
      }));
    },

    async history(/** @type {string} */ sessionId) {
      const api = await load();
      return historyEvents(await api.getSessionMessages(sessionId, { dir: host.cwd }));
    },

    async remove(/** @type {string} */ sessionId) {
      const api = await load();
      const ended = current?.id === sessionId ? close() : stopping.get(sessionId);
      if (ended) await Promise.race([ended, new Promise((r) => setTimeout(r, 10_000))]);
      await api.deleteSession(sessionId, { dir: host.cwd });
    },

    /**
     * The account's usage windows as Claude Code's /usage reports them, in its
     * own words. It is a command Claude Code answers itself, without calling a
     * model, run in a query of its own so that it stays out of the conversation
     * and out of the list of sessions. Asked twice at once, it runs once.
     */
    usage() {
      usageRun ??= (async () => {
        const api = await load();
        const inbox = new Inbox();
        const q = api.query({
          prompt: inbox,
          options: { cwd: host.cwd, settingSources: [], strictMcpConfig: true, persistSession: false, env: claudeEnv() },
        });
        const timer = setTimeout(() => q.close(), 30_000);
        try {
          inbox.push({ type: "user", parent_tool_use_id: null, message: { role: "user", content: "/usage" } });
          let text = "";
          for await (const msg of q) {
            if (msg.type === "assistant") for (const block of msg.message.content) if (block.type === "text") text += block.text;
            if (msg.type === "result") break;
          }
          if (!text.trim()) throw new Error("Claude Code gave no usage report.");
          return { text, at: Date.now() };
        } finally {
          clearTimeout(timer);
          inbox.close();
          q.close();
        }
      })().finally(() => (usageRun = null));
      return usageRun;
    },

    /** The person signs in to Claude Code itself, in a terminal: `claude` → /login. */
    login: () => openTerminal("claude"),
  };
}
