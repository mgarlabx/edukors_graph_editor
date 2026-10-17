// @ts-check
/**
 * An agent that speaks the Agent Client Protocol: Kiro (`kiro-cli acp`) and
 * Kimi (`kimi acp`). ACP is JSON-RPC over the CLI's stdio, the way Zed and
 * the JetBrains IDEs drive a coding agent, so the editor drives them the same
 * way: one process kept between conversations, a session per conversation,
 * a `session/prompt` per message.
 *
 * What differs between them is in their own modules (kiro.mjs, kimi.mjs):
 * where the CLI is, how it is started, and the files that give it the
 * editor's prompt, the editor's bridge as its MCP servers, and nothing more
 * than it needs. What is the same is here.
 *
 * Every course edit goes through the bridge (agent/mcpBridge.mjs), where the
 * editor's gate decides. The editor offers the agent no files and no terminal
 * of its own; when the agent asks before using a tool of its own
 * (`session/request_permission`), a command is put to the person, reading and
 * searching pass, and a change to a file is refused: this agent writes none.
 *
 * What the CLI keeps of a conversation is its own; the editor writes its own
 * journal (agent/journal.mjs), as for Antigravity, and keeps the CLI's session
 * id to carry on where it left off.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as tools from "../tools.mjs";
import * as ext from "../extensions.mjs";
import { attach } from "../jsonRpc.mjs";
import { journal } from "../journal.mjs";
import { openTerminal } from "../terminal.mjs";
import { authFailure, createMapper, sessionModels, toolInput, toolName } from "./acpEvents.mjs";

/** A turn may take as long as the person lets it. */
const TURN_MS = 12 * 60 * 60 * 1000;

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   find: () => Promise<string | null>;
 *   args: string[];
 *   env: (bridge: { url: string; token: string }) => NodeJS.ProcessEnv;
 *   prepare: (ctx: { home: string; workspace: string; prompt: string; bridge: { url: string; token: string }; servers: string[] }) => string;
 *   mcpServers: (bridge: { url: string; token: string }, servers: string[]) => any[];
 *   account?: (path: string) => Promise<{ signedIn: boolean | "unknown"; email?: string; plan?: string } | null>;
 *   login: (path: string) => string;
 * }} Spec
 */

/** The one the person picks among the agent's options, by kind. @param {any[]} options @param {string[]} kinds */
const pick = (options, kinds) => {
  for (const kind of kinds) {
    const found = options.find((o) => o?.kind === kind);
    if (found) return { outcome: { outcome: "selected", optionId: String(found.optionId) } };
  }
  return null;
};

/** Every word a tool call says about itself, to tell whose it is. @param {any} call */
const wordsOf = (call) => {
  try {
    return [call?.title, call?.toolName, call?.name, JSON.stringify(call?._meta ?? {}), JSON.stringify(call?.rawInput ?? {})].filter(Boolean).join(" ");
  } catch {
    return String(call?.title ?? "");
  }
};

/**
 * @param {Spec} spec
 * @param {import("../host").Host} host
 */
export function createAcp(spec, host) {
  const home = join(host.cwd, spec.id);
  const workspace = join(home, "workspace");
  const jrn = journal(join(home, "transcripts"));
  const prefix = spec.id;

  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
  let child = null;
  /** @type {ReturnType<typeof attach> | null} */
  let rpc = null;
  /** @type {Promise<void> | null} */
  let starting = null;
  /** What the running process was started with, so that a change starts it again. */
  let started = "";
  /** @type {any} */
  let agentCaps = {};
  /** @type {{ sid: string; acpId: string; model?: string; effort?: string; modelOption: string | null; effortOption: string | null } | null} */
  let conv = null;
  /** @type {ReturnType<typeof createMapper> | null} */
  let mapper = null;
  let turnOpen = false;
  /** While a session is being loaded the agent replays it; the journal already has it. */
  let loading = false;
  /** @type {string[]} */
  let stderrTail = [];
  /** The person's servers, by name, as the bridge serves them. @type {string[]} */
  let servers = [];
  /** The tool calls the agent announced, by id, as they stand. @type {Map<string, any>} */
  const calls = new Map();
  host.onExit(() => child?.kill("SIGKILL"));

  const missing = () => Object.assign(new Error(`the ${spec.name} was not found`), { code: `${spec.id}-missing` });

  /**
   * Whether a tool call is to the bridge, which shows each call itself and
   * asks the person when it should: the editor's tools, or the person's
   * servers served there. The agents name an MCP call in their own words, so
   * what it says about itself is read for the server's name.
   * @param {any} call
   */
  function ownsTool(call) {
    const kind = String(call?.kind ?? "other");
    if (kind !== "other" && kind !== "fetch") return false;
    const words = wordsOf(call);
    return [tools.SERVER, ...servers].some((name) => {
      const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`mcp__${n}__|@${n}/|\\b${n}[_/.]|server[^a-z]{1,4}${n}\\b|\\(${n}\\)`, "i").test(words);
    });
  }

  /** @param {any} ev */
  function emit(ev) {
    if (!conv) return;
    if (ev.ev === "turn_end") turnOpen = false;
    host.emit(conv.sid, ev);
    if (["assistant", "tool_result", "notice", "turn_end"].includes(ev.ev)) jrn.append(conv.sid, ev);
  }

  /**
   * What the agent asks the editor while it works. Only permission is
   * answered: the editor offers no files and no terminal of its own.
   * @param {string} method
   * @param {any} params
   */
  async function onRequest(method, params) {
    if (method !== "session/request_permission") throw new Error(`unhandled request: ${method}`);
    // The call asked about is one the agent announced already, and the
    // question may name only its id: what was announced fills in the rest.
    const asked = params?.toolCall ?? {};
    const call = { ...(calls.get(String(asked.toolCallId ?? "")) ?? {}), ...Object.fromEntries(Object.entries(asked).filter(([k, v]) => v != null && k !== "title" && k !== "content")) };
    const options = Array.isArray(params?.options) ? params.options : [];
    const allow = () => pick(options, ["allow_once", "allow_always"]) ?? { outcome: { outcome: "cancelled" } };
    const refuse = () => pick(options, ["reject_once", "reject_always"]) ?? { outcome: { outcome: "cancelled" } };
    if (ownsTool(call)) return allow();
    const kind = String(call.kind ?? "other");
    if (kind === "read" || kind === "search" || kind === "think") return allow();
    if (kind === "execute") {
      const input = toolInput(call);
      const command = String(input.command ?? input.cmd ?? call.title ?? "");
      const verdict = await host.askCommand({ command, ...(input.cwd ? { cwd: String(input.cwd) } : {}) }, call.toolCallId ? String(call.toolCallId) : undefined);
      return verdict.allow ? allow() : refuse();
    }
    if (kind === "fetch") {
      const verdict = await host.gate("WebFetch", toolInput(call), { toolUseId: call.toolCallId ? String(call.toolCallId) : undefined });
      return verdict.allow ? allow() : refuse();
    }
    if (kind === "edit" || kind === "delete" || kind === "move") emit({ ev: "notice", level: "warning", text: "", code: "acp_file_change" });
    else host.log(`${spec.id} asked to use ${toolName(call)}: refused`);
    return refuse();
  }

  /** @param {string} method @param {any} params */
  function onNotification(method, params) {
    if (method !== "session/update" || loading || !conv || params?.sessionId !== conv.acpId) return;
    const update = params.update ?? {};
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      const key = String(update.toolCallId ?? "");
      const known = calls.get(key) ?? {};
      calls.set(key, { ...known, ...Object.fromEntries(Object.entries(update).filter(([k, v]) => v != null && k !== "content" && k !== "rawOutput")), ...(known.content ? {} : { content: update.content }) });
    }
    for (const ev of mapper?.map(params.update) ?? []) emit(ev);
  }

  /** Stops the process, if there is one. */
  function stop() {
    const dying = child;
    child = null;
    rpc = null;
    started = "";
    dying?.kill();
  }

  /**
   * The CLI, started once and kept until this process goes, or until what it
   * was given changes (the prompt, the person's servers), which starts it again.
   * @param {string} instructions
   */
  async function ensureServer(instructions) {
    await starting?.catch(() => undefined);
    const path = await spec.find();
    if (!path) throw missing();
    const bridge = await host.bridge();
    mkdirSync(workspace, { recursive: true });
    const signature = spec.prepare({ home, workspace, prompt: host.systemPrompt(spec.id, instructions), bridge, servers });
    if (rpc && child && child.exitCode === null && signature === started) return;
    stop();
    starting = (async () => {
      const proc = spawn(path, spec.args, { cwd: workspace, env: spec.env(bridge), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      child = proc;
      stderrTail = [];
      proc.on("error", (e) => host.log(`${spec.id} could not start:`, e));
      proc.stderr.on("data", (chunk) => {
        const text = String(chunk);
        host.log(`${spec.id}:`, text.trimEnd());
        stderrTail.push(text);
        if (stderrTail.length > 40) stderrTail.shift();
      });
      proc.on("exit", (code, signal) => {
        if (child === proc) {
          child = null;
          rpc = null;
          started = "";
        }
        if (turnOpen) emit({ ev: "turn_end", status: "error", code: `${spec.id}_exit`, text: stderrTail.join("").trim().slice(-2000) || `${spec.id} stopped (${signal ?? code})` });
      });
      rpc = attach(proc, { onNotification, onRequest, log: host.log, jsonrpc: true });
      try {
        const init = await rpc.request(
          "initialize",
          {
            protocolVersion: 1,
            clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
            clientInfo: { name: "edukors-graph-editor", title: "Edukors Graph Editor", version: "2.0.0" },
          },
          60_000,
        );
        agentCaps = init?.agentCapabilities ?? {};
        started = signature;
      } catch (e) {
        const tail = stderrTail.join("").trim().slice(-2000);
        stop();
        throw Object.assign(new Error(tail || String(/** @type {Error} */ (e)?.message ?? e)), { code: `${spec.id}-failed` });
      }
    })().finally(() => (starting = null));
    return starting;
  }

  /** The session the conversation goes on in: the one it had, or a new one. @param {string | undefined} acpId */
  async function session(acpId) {
    const mcpServers = spec.mcpServers(await host.bridge(), servers);
    if (acpId) {
      const method = agentCaps?.sessionCapabilities?.resume ? "session/resume" : agentCaps?.loadSession ? "session/load" : null;
      if (method) {
        loading = true;
        try {
          return { acpId, ...(await /** @type {any} */ (rpc).request(method, { sessionId: acpId, cwd: workspace, mcpServers }, 120_000)) };
        } catch (e) {
          // A session the CLI no longer has: the conversation goes on in a new one, on screen as it was.
          host.log(`${spec.id} could not resume ${acpId}:`, e);
        } finally {
          loading = false;
        }
      }
    }
    const opened = await /** @type {any} */ (rpc).request("session/new", { cwd: workspace, mcpServers }, 120_000);
    const id = String(opened?.sessionId ?? "");
    if (!id) throw new Error(`${spec.name} opened no session`);
    return { ...opened, acpId: id };
  }

  /** Sets a model or an effort on the CLI's session, the way it takes it. @param {"model" | "effort"} what @param {string} value */
  async function apply(what, value) {
    if (!conv || !rpc) return;
    const option = what === "model" ? conv.modelOption : conv.effortOption;
    try {
      if (option) await rpc.request("session/set_config_option", { sessionId: conv.acpId, configId: option, value }, 30_000);
      else if (what === "model") await rpc.request("session/set_model", { sessionId: conv.acpId, modelId: value }, 30_000);
    } catch (e) {
      host.log(`${spec.id} set ${what}:`, e);
    }
  }

  const signedOut = () => ({
    sessionId: "",
    resumed: false,
    account: { provider: spec.id, signedIn: false },
    models: [],
    mcp: host.serverStates(),
    skills: [],
  });

  return {
    /** @param {any} opts */
    async open(opts) {
      await this.close();
      const path = await spec.find();
      if (!path) throw missing();
      servers = await host.personalServers(opts.mcp);
      const who = spec.account ? await spec.account(path) : null;
      if (who?.signedIn === false) return signedOut();
      try {
        await ensureServer(opts.instructions);
      } catch (e) {
        // A CLI that will not start without an account says so on its way out.
        if (authFailure(String(/** @type {Error} */ (e)?.message ?? ""))) return signedOut();
        throw e;
      }
      const sid = opts.resume ?? randomUUID();
      const meta = opts.resume ? jrn.meta(sid) : {};
      /** @type {any} */
      let opened;
      try {
        opened = await session(typeof meta.acpId === "string" ? meta.acpId : undefined);
      } catch (e) {
        if (authFailure(String(/** @type {Error} */ (e)?.message ?? ""))) return signedOut();
        throw e;
      }
      const { models, modelOption, effortOption } = sessionModels(opened);
      if (!opts.resume) jrn.start(sid, { sid, acpId: opened.acpId });
      else if (meta.acpId !== opened.acpId) jrn.setMeta(sid, { acpId: opened.acpId });
      conv = { sid, acpId: opened.acpId, modelOption, effortOption };
      mapper = createMapper({ ownsTool, prefix });
      if (opts.model && opts.model !== "default") {
        conv.model = opts.model;
        await apply("model", opts.model);
      }
      if (opts.effort && opts.effort !== "auto" && effortOption) {
        conv.effort = opts.effort;
        await apply("effort", opts.effort);
      }
      return {
        sessionId: sid,
        resumed: Boolean(opts.resume),
        account: { provider: spec.id, signedIn: true, ...(who?.email ? { email: who.email } : {}), ...(who?.plan ? { plan: who.plan } : {}) },
        models,
        mcp: host.serverStates(),
        skills: ext.listSkills(host.pluginDir, host.log),
      };
    },

    /** @param {string} text @param {string} [uuid] */
    async send(text, uuid) {
      const here = conv;
      if (!here || !rpc) throw new Error("no conversation open");
      jrn.append(here.sid, { ev: "user", key: uuid ?? randomUUID(), text });
      turnOpen = true;
      // Plan mode is not the CLI's own (it would write the plan to a file):
      // the editor's instructions for it go with the message.
      const prompt = host.mode() === "plan" ? [{ type: "text", text: host.planInstructions(spec.id) }, { type: "text", text }] : [{ type: "text", text }];
      const turn = mapper;
      rpc
        .request("session/prompt", { sessionId: here.acpId, prompt }, TURN_MS)
        .then((result) => {
          if (conv !== here || !turn) return;
          for (const ev of turn.end(String(result?.stopReason ?? "end_turn"), spec.id)) emit(ev);
        })
        .catch((e) => {
          if (conv !== here || !turnOpen) return;
          const message = String(/** @type {Error} */ (e)?.message ?? e);
          emit({ ev: "turn_end", status: "error", code: authFailure(message) ? `${spec.id}_auth` : `${spec.id}_error`, text: message });
        });
      return { sessionId: here.sid };
    },

    async interrupt() {
      if (!conv || !rpc) return;
      rpc.notify("session/cancel", { sessionId: conv.acpId });
    },

    /** @param {{ model?: string; effort?: string }} req */
    async set(req) {
      if (!conv) return;
      if (req.model && req.model !== (conv.model ?? "default")) {
        conv.model = req.model === "default" ? undefined : req.model;
        if (conv.model) await apply("model", conv.model);
      }
      if (req.effort && req.effort !== (conv.effort ?? "auto")) {
        conv.effort = req.effort === "auto" ? undefined : req.effort;
        if (conv.effort) await apply("effort", conv.effort);
      }
    },

    async close() {
      const open = conv;
      conv = null;
      calls.clear();
      turnOpen = false;
      if (open && rpc) {
        rpc.notify("session/cancel", { sessionId: open.acpId });
        if (agentCaps?.sessionCapabilities?.close) await rpc.request("session/close", { sessionId: open.acpId }, 10_000).catch(() => undefined);
      }
    },

    async list() {
      return jrn.list();
    },

    /** @param {string} sid */
    async history(sid) {
      return jrn.read(sid);
    },

    /** @param {string} sid */
    async remove(sid) {
      if (conv?.sid === sid) await this.close();
      const acpId = jrn.meta(sid).acpId;
      if (acpId && rpc && agentCaps?.sessionCapabilities?.delete) await rpc.request("session/delete", { sessionId: String(acpId) }, 30_000).catch(() => undefined);
      jrn.remove(sid);
    },

    /** The person signs in to the CLI itself, in a terminal. */
    async login() {
      const path = await spec.find();
      if (!path) throw missing();
      // The next open starts the CLI again, with the account it has then.
      stop();
      return openTerminal(spec.login(path));
    },
  };
}
