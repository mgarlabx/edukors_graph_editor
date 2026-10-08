// @ts-check
/**
 * The agent on OpenAI's Codex, through its app server (`codex app-server`),
 * the same interface its own editor extensions use: JSON-RPC over stdio, with
 * the ChatGPT account the CLI is signed in with.
 *
 * It is the person's own install (`npm i -g @openai/codex`), never bundled:
 * the binary is a few hundred megabytes per platform, which has no place in
 * the app's installer.
 *
 * What the editor sets up for it: a home of its own under the app's data
 * folder (CODEX_HOME), whose config.toml gives it one MCP server, the editor's
 * bridge (agent/mcpBridge.mjs), and a read-only sandbox in a workspace that
 * holds nothing. The course is edited only through the bridge, where the
 * editor's gate decides every call. Codex asks the editor before running a
 * command, which the panel puts to the person, and a change to a file is
 * refused: this agent writes no files.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as tools from "../tools.mjs";
import { findCli, versionOf } from "../cli.mjs";
import { attach } from "../jsonRpc.mjs";
import { answersFrom, createMapper, historyEvents, mapQuestions } from "./codexEvents.mjs";

export const id = "codex";

export const capabilities = { efforts: true, usage: false, bash: true, skills: false, mcp: false, login: "browser", ownQuestions: false };

const BINARY = "codex";

/** Where npm and Homebrew put it, which a Finder-launched app does not have on its PATH. */
const places = () =>
  process.platform === "win32"
    ? [join(process.env.APPDATA ?? "", "npm", "codex.cmd")]
    : [join(homedir(), ".local", "bin", BINARY), "/opt/homebrew/bin/codex", "/usr/local/bin/codex", join(homedir(), ".npm-global", "bin", BINARY), join(homedir(), ".bun", "bin", BINARY)];

/** @type {string | null | undefined} */
let found;

async function findCodex() {
  if (found === undefined) found = await findCli({ binary: BINARY, envVar: "EDUKORS_CODEX", places: places() });
  return found;
}

export async function detect() {
  const path = await findCodex();
  if (!path) return { available: false, reason: "missing" };
  const version = await versionOf(path);
  return { available: true, path, ...(version ? { version } : {}) };
}

/** @type {{ value: string; displayName: string; efforts?: string[] }[] | null} */
let modelCache = null;

/**
 * @param {import("../host").Host} host
 */
export function create(host) {
  const home = join(host.cwd, "codex");
  const workspace = join(home, "workspace");

  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
  let child = null;
  /** @type {ReturnType<typeof attach> | null} */
  let rpc = null;
  /** @type {Promise<void> | null} */
  let starting = null;
  /** @type {{ sid: string; model?: string; effort?: string; live: boolean } | null} */
  let conv = null;
  /** @type {ReturnType<typeof createMapper> | null} */
  let mapper = null;
  let turnOpen = false;
  /** @type {string[]} */
  let stderrTail = [];
  host.onExit(() => child?.kill("SIGKILL"));

  const ownsTool = (/** @type {string} */ name) => name.startsWith(`mcp__${tools.SERVER}__`) || tools.TOOLS.some((t) => t.name === name);

  /** @param {any} ev */
  function emit(ev) {
    if (!conv) return;
    if (ev.ev === "turn_end") turnOpen = false;
    host.emit(conv.sid, ev);
  }

  /**
   * Codex's own home, with the editor's bridge as its only MCP server and
   * nothing it may write to. It is the editor's, not the person's, so that
   * their own Codex setup is never touched; only the sign-in is borrowed from
   * it, so that someone already signed in on this Mac is not asked again.
   *
   * What goes in config.toml is kept to a minimum: a setting a build of Codex
   * no longer takes makes the app server exit at startup, and how a turn is
   * approved is given to each thread anyway (thread/start).
   */
  function writeHome(/** @type {{ url: string; token: string }} */ bridge) {
    mkdirSync(workspace, { recursive: true });
    const config = [
      "# Written by the Edukors Graph Editor at every start; changes here are lost.",
      'sandbox_mode = "read-only"',
      "",
      `[mcp_servers.${tools.SERVER}]`,
      `url = ${JSON.stringify(bridge.url)}`,
      'bearer_token_env_var = "EDUKORS_MCP_TOKEN"',
      "",
    ].join("\n");
    writeFileSync(join(home, "config.toml"), config);
    // The person's own sign-in, copied once: Codex refreshes its own copy from here on.
    const mine = join(home, "auth.json");
    const theirs = join(homedir(), ".codex", "auth.json");
    if (!existsSync(mine) && existsSync(theirs)) {
      try {
        copyFileSync(theirs, mine);
      } catch (e) {
        host.log("codex sign-in not copied:", e);
      }
    }
  }

  /**
   * What Codex asks the editor while it works. The shapes are its own
   * (`codex app-server generate-json-schema` prints them): a value it does not
   * know is refused outright, so each answer is written as that schema names
   * it, and anything new is declined rather than guessed at.
   */
  async function onRequest(/** @type {string} */ method, /** @type {any} */ params) {
    switch (method) {
      // Codex puts its own question to whoever drives it before letting an MCP
      // server be called. The editor's bridge is what really decides, by
      // asking the person about the call itself, so this one only says yes to
      // the editor's own server.
      case "mcpServer/elicitation/request":
        return { action: params?.serverName === tools.SERVER ? "accept" : "decline" };

      // A command can do anything on the Mac, so each one is put to the person.
      case "item/commandExecution/requestApproval":
      case "execCommandApproval": {
        const command = Array.isArray(params?.command) ? params.command.join(" ") : String(params?.command ?? "");
        const verdict = await host.askCommand({ command, ...(params?.cwd ? { cwd: String(params.cwd) } : {}) }, params?.itemId);
        if (method === "execCommandApproval") return { decision: verdict.allow ? "approved" : "denied" };
        return { decision: verdict.allow ? "accept" : "decline" };
      }

      // This agent writes no files: a change to one is refused, and said so.
      case "item/fileChange/requestApproval":
        emit({ ev: "notice", level: "warning", text: "", code: "codex_file_change" });
        return { decision: "decline" };
      case "applyPatchApproval":
        emit({ ev: "notice", level: "warning", text: "", code: "codex_file_change" });
        return { decision: "denied" };

      // More of the Mac than the sandbox allows: nothing extra is granted.
      case "item/permissions/requestApproval":
        host.log("codex asked for more permissions:", JSON.stringify(params?.permissions ?? {}).slice(0, 200));
        return { permissions: {} };

      case "item/tool/requestUserInput": {
        const input = mapQuestions(params);
        if (!input.questions.length) return answersFrom(params, {});
        const answer = await host.ask({ kind: "question", tool: "ask_user", input, toolUseId: String(params?.itemId ?? ""), reason: null });
        if (answer.behavior !== "allow") return answersFrom(params, {});
        return answersFrom(params, /** @type {Record<string, string>} */ ((answer.updatedInput ?? {}).answers ?? {}));
      }

      // Codex asks whoever holds the sign-in for a fresh token. The editor
      // borrowed the person's, so it answers from the file it borrowed.
      case "account/chatgptAuthTokens/refresh": {
        const tokens = readTokens();
        if (!tokens?.access_token || !tokens?.account_id) throw new Error("the editor has no ChatGPT token to refresh");
        return { accessToken: tokens.access_token, chatgptAccountId: tokens.account_id };
      }

      default:
        throw new Error(`unhandled request: ${method}`);
    }
  }

  /** The ChatGPT tokens of the sign-in this agent runs on, ours or the person's. */
  function readTokens() {
    for (const path of [join(home, "auth.json"), join(homedir(), ".codex", "auth.json")]) {
      try {
        return JSON.parse(readFileSync(path, "utf8")).tokens;
      } catch {
        /* the next one, or none */
      }
    }
    return null;
  }

  /** @param {string} method @param {any} params */
  function onNotification(method, params) {
    if (method.startsWith("account/login")) {
      const ok = !/fail|error|cancel/i.test(method) && params?.success !== false && !params?.error;
      host.out({ t: "login", provider: id, ok, ...(params?.error ? { error: String(params.error?.message ?? params.error) } : {}) });
      return;
    }
    for (const ev of mapper?.map(method, params) ?? []) emit(ev);
  }

  /** The app server, started once and kept until this process goes. */
  function ensureServer() {
    if (rpc && child && child.exitCode === null) return Promise.resolve();
    starting ??= (async () => {
      const path = await findCodex();
      if (!path) {
        const error = new Error("the Codex CLI was not found");
        /** @type {any} */ (error).code = "codex-missing";
        throw error;
      }
      const bridge = await host.bridge();
      mkdirSync(home, { recursive: true });
      writeHome(bridge);
      const env = { ...process.env, CODEX_HOME: home, EDUKORS_MCP_TOKEN: bridge.token };
      delete env.OPENAI_API_KEY;
      delete env.ANTHROPIC_API_KEY;
      delete env.GEMINI_API_KEY;
      delete env.GOOGLE_API_KEY;
      const started = spawn(path, ["app-server"], { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      child = started;
      stderrTail = [];
      started.stderr.on("data", (chunk) => {
        const text = String(chunk);
        host.log("codex:", text.trimEnd());
        stderrTail.push(text);
        if (stderrTail.length > 40) stderrTail.shift();
      });
      started.on("exit", (code, signal) => {
        if (child === started) {
          child = null;
          rpc = null;
        }
        if (turnOpen) emit({ ev: "turn_end", status: "error", code: "codex_exit", text: stderrTail.join("").trim().slice(-2000) || `codex stopped (${signal ?? code})` });
        if (conv) host.ended(conv.sid, "the Codex app server stopped");
        conv = null;
      });
      rpc = attach(started, { onNotification, onRequest, log: host.log });
      try {
        await rpc.request("initialize", { clientInfo: { name: "edukors-graph-editor", title: "Edukors Graph Editor", version: "2.0.0" }, capabilities: { experimentalApi: true } }, 30_000);
      } catch (e) {
        // A Codex that refuses its own configuration says why on the way out,
        // which is the only useful thing to show the person.
        const tail = stderrTail.join("").trim().slice(-2000);
        rpc = null;
        throw Object.assign(new Error(tail || String(/** @type {Error} */ (e)?.message ?? e)), { code: "codex-failed" });
      }
      rpc.notify("initialized", {});
    })().finally(() => (starting = null));
    return starting;
  }

  async function models() {
    if (modelCache) return modelCache;
    try {
      const list = await /** @type {any} */ (rpc).request("model/list", { limit: 40 }, 30_000);
      const items = Array.isArray(list?.data) ? list.data : Array.isArray(list?.models) ? list.models : Array.isArray(list) ? list : [];
      const models = items
        .filter((/** @type {any} */ m) => !m?.hidden)
        .map((/** @type {any} */ m) => ({
          value: String(m.id ?? m.model ?? ""),
          displayName: String(m.displayName ?? m.id ?? m.model ?? ""),
          ...(Array.isArray(m.supportedReasoningEfforts) && m.supportedReasoningEfforts.length
            ? { efforts: m.supportedReasoningEfforts.map((/** @type {any} */ e) => String(e?.reasoningEffort ?? e)).filter(Boolean) }
            : {}),
        }))
        .filter((/** @type {{ value: string }} */ m) => m.value);
      const fallback = items.find((/** @type {any} */ m) => m?.isDefault);
      modelCache = [{ value: "default", displayName: fallback?.displayName ? String(fallback.displayName) : "", ...(fallback?.id ? { resolved: String(fallback.id) } : {}) }, ...models];
      return modelCache;
    } catch (e) {
      host.log("codex models:", e);
      return [{ value: "default", displayName: "" }];
    }
  }

  /** @returns {Promise<{ provider: string; signedIn: boolean | "unknown"; email?: string; plan?: string }>} */
  async function account() {
    try {
      const read = await /** @type {any} */ (rpc).request("account/read", { refreshToken: false }, 30_000);
      // Signed out, Codex answers with the account as null, which is an answer, not a gap.
      const info = (read && "account" in read ? read.account : read) ?? {};
      const signedIn = Boolean(info.type || info.email || info.planType || info.accountId || info.authMode || info.auth_mode);
      return {
        provider: id,
        signedIn,
        ...(info.email ? { email: String(info.email) } : {}),
        ...(info.planType ? { plan: String(info.planType) } : info.type === "apiKey" ? { plan: "API key" } : {}),
      };
    } catch (e) {
      host.log("codex account:", e);
      return { provider: id, signedIn: false };
    }
  }

  return {
    capabilities,

    /** @param {any} opts */
    async open(opts) {
      await this.close();
      await ensureServer();
      const who = await account();
      if (!who.signedIn) {
        // Nothing to open until there is an account: the panel offers the sign-in.
        return { sessionId: "", resumed: false, account: who, models: [], mcp: [], skills: [] };
      }
      mapper = createMapper({ ownsTool });
      const model = opts.model && opts.model !== "default" ? opts.model : undefined;
      const effort = opts.effort && opts.effort !== "auto" ? opts.effort : undefined;
      const thread = opts.resume
        ? await /** @type {any} */ (rpc).request("thread/resume", { threadId: opts.resume }, 60_000)
        : await /** @type {any} */ (rpc).request(
            "thread/start",
            {
              cwd: workspace,
              // The app server takes these in its own spelling, which is not
              // the one its reference writes; a value it does not know is
              // refused outright, so they are kept as it names them.
              approvalPolicy: "untrusted",
              sandboxPolicy: { type: "readOnly" },
              baseInstructions: host.systemPrompt(id, opts.instructions),
              ...(model ? { model } : {}),
              ...(effort ? { effort } : {}),
            },
            60_000,
          );
      const sid = String(thread?.thread?.id ?? thread?.threadId ?? thread?.id ?? "");
      if (!sid) throw new Error("Codex opened no thread");
      conv = { sid, model, effort, live: true };
      return { sessionId: sid, resumed: Boolean(opts.resume), account: who, models: await models(), mcp: [], skills: [] };
    },

    /** @param {string} text */
    async send(text) {
      // The conversation this message belongs to: the one on screen may change
      // while the turn is being started.
      const here = conv;
      if (!here) throw new Error("no conversation open");
      turnOpen = true;
      const started = await /** @type {any} */ (rpc).request(
        "turn/start",
        {
          threadId: here.sid,
          input: [{ type: "text", text }],
          ...(here.model ? { model: here.model } : {}),
          ...(here.effort ? { effort: here.effort } : {}),
        },
        60_000,
      );
      if (mapper && started?.turn?.id) mapper.turnId = String(started.turn.id);
      return { sessionId: here.sid };
    },

    async interrupt() {
      if (!conv || !rpc) return;
      await rpc.request("turn/interrupt", { threadId: conv.sid, ...(mapper?.turnId ? { turnId: mapper.turnId } : {}) }, 30_000).catch((e) => host.log("codex interrupt:", e));
    },

    /** @param {{ model?: string; effort?: string }} req */
    async set(req) {
      if (!conv) return;
      // The model and the effort are given to each turn, so they take effect on the next message.
      if (req.model) conv.model = req.model === "default" ? undefined : req.model;
      if (req.effort) conv.effort = req.effort === "auto" ? undefined : req.effort;
    },

    async close() {
      const open = conv;
      conv = null;
      turnOpen = false;
      if (open && rpc) await rpc.request("thread/unsubscribe", { threadId: open.sid }, 10_000).catch(() => undefined);
    },

    async list() {
      await ensureServer();
      const list = await /** @type {any} */ (rpc).request("thread/list", { limit: 100 }, 30_000).catch(() => null);
      const items = Array.isArray(list?.data) ? list.data : Array.isArray(list?.threads) ? list.threads : [];
      return items.map((/** @type {any} */ t) => ({
        id: String(t.id ?? t.threadId ?? ""),
        ...(t.name || t.preview ? { title: String(t.name || t.preview) } : {}),
        ...(t.preview ? { firstPrompt: String(t.preview) } : {}),
        lastModified: Number(t.updatedAt ?? t.createdAt ?? 0) * (Number(t.updatedAt ?? t.createdAt ?? 0) < 1e12 ? 1000 : 1),
      }));
    },

    /** @param {string} sid */
    async history(sid) {
      await ensureServer();
      const read = await /** @type {any} */ (rpc).request("thread/read", { threadId: sid, includeTurns: true }, 60_000);
      return historyEvents(read?.thread ?? read, { ownsTool });
    },

    /** Codex keeps no delete: a thread the person removed from the list is archived. @param {string} sid */
    async remove(sid) {
      await ensureServer();
      if (conv?.sid === sid) await this.close();
      await /** @type {any} */ (rpc).request("thread/archive", { threadId: sid }, 30_000);
    },

    /** The ChatGPT sign-in happens in the browser; the panel opens the page and waits for the notification. */
    async login() {
      await ensureServer();
      const started = await /** @type {any} */ (rpc).request("account/login/start", { type: "chatgpt", useHostedLoginSuccessPage: true }, 60_000);
      const url = started?.authUrl ?? started?.url ?? started?.loginUrl;
      if (!url) throw new Error("Codex gave no sign-in page");
      return { url: String(url) };
    },
  };
}
