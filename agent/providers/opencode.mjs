// @ts-check
/**
 * The agent on OpenCode, through its headless server (`opencode serve`), the
 * same interface its desktop app and editor extensions use: HTTP for what the
 * editor asks, and a stream of server-sent events for what happens.
 *
 * OpenCode answers with whichever provider the person connected to it
 * (`opencode auth login`: OpenCode Zen or Go, a ChatGPT or Copilot plan, a key
 * of their own), so the models the panel offers are theirs. It is the person's
 * own install (https://opencode.ai), never bundled.
 *
 * What the editor sets up for it: a workspace that holds nothing, under the
 * app's data folder, and a configuration given in the environment
 * (OPENCODE_CONFIG_CONTENT), read when the server starts. It names an agent of
 * the editor's own, whose permissions deny every tool but the editor's bridge
 * (agent/mcpBridge.mjs) -- the editor's own server and each of the person's,
 * served again there -- and the skills, so the course is edited only through
 * the bridge, where the editor's gate decides every call. The editor's system
 * prompt goes with each message, so a change of mode or instructions takes
 * effect on the next one. The server listens on 127.0.0.1 behind a password
 * made for this process.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as tools from "../tools.mjs";
import * as ext from "../extensions.mjs";
import { findCli, helpOf, versionOf, WINDOWS } from "../cli.mjs";
import { openTerminal } from "../terminal.mjs";
import { createMapper, historyEvents, parseModels, titleOf, usableProviders } from "./opencodeEvents.mjs";

export const id = "opencode";

export const capabilities = { efforts: true, usage: false, bash: false, skills: true, mcp: true, login: "external", ownQuestions: false };

/** The agent the server runs the conversation as, defined in the configuration it starts with. */
const AGENT = "edukors";
/** How long the server has to say where it listens. */
const START_MS = 30_000;

const BINARY = "opencode";

/** Where its installers put it, which a Finder-launched app does not have on its PATH. */
const places = () =>
  WINDOWS
    ? [join(homedir(), ".opencode", "bin", "opencode.exe"), join(process.env.APPDATA ?? "", "npm", "opencode.cmd")]
    : [
        join(homedir(), ".opencode", "bin", BINARY),
        "/opt/homebrew/bin/opencode",
        "/usr/local/bin/opencode",
        join(homedir(), ".local", "bin", BINARY),
        join(homedir(), ".npm-global", "bin", BINARY),
        join(homedir(), ".bun", "bin", BINARY),
      ];

/** @type {string | null | undefined} */
let found;

async function findOpencode() {
  if (found === undefined) found = await findCli({ binary: BINARY, envVar: "EDUKORS_OPENCODE", places: places() });
  return found;
}

export async function detect() {
  const path = await findOpencode();
  if (!path) return { available: false, reason: "missing" };
  const version = await versionOf(path);
  return { available: true, path, ...(version ? { version } : {}) };
}

/** The name OpenCode gives an MCP server's tools: `<server>_<tool>`, with anything but letters, digits, `_` and `-` as `_`. */
const prefixOf = (/** @type {string} */ server) => `${server.replace(/[^A-Za-z0-9_-]/g, "_")}_`;

/**
 * @param {import("../host").Host} host
 */
export function create(host) {
  const workspace = join(host.cwd, "opencode", "workspace");

  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
  let child = null;
  /** Where the running server listens, and how it is told the editor is the one asking. @type {{ url: string; auth: string } | null} */
  let server = null;
  /** @type {Promise<void> | null} */
  let starting = null;
  /** @type {AbortController | null} */
  let listening = null;
  /** @type {{ sid: string; model?: string; effort?: string; instructions?: string } | null} */
  let conv = null;
  /** @type {ReturnType<typeof createMapper> | null} */
  let mapper = null;
  /** @type {string[]} */
  let stderrTail = [];
  /** The person's servers the running server was given, by name, through the bridge. @type {string[]} */
  let servers = [];
  /** @type {ReturnType<typeof parseModels> | null} */
  let modelCache = null;
  host.onExit(() => child?.kill("SIGKILL"));

  /** Every MCP server OpenCode has is the bridge, which shows each call itself. */
  const ownsTool = (/** @type {string} */ name) => [tools.SERVER, ...servers].some((s) => name.startsWith(prefixOf(s)));

  /** A tool OpenCode calls `edukors_read_course`, as the bridge names it: `mcp__edukors__read_course`. */
  const qualify = (/** @type {string} */ name) => {
    const server = [tools.SERVER, ...servers].filter((s) => name.startsWith(prefixOf(s))).sort((a, b) => b.length - a.length)[0];
    return server ? `mcp__${server}__${name.slice(prefixOf(server).length)}` : null;
  };

  /**
   * The configuration the server starts with. It goes on top of the
   * person's own, whose providers and models it keeps: the editor's agent
   * replaces everything else that matters, its permissions last.
   * @param {{ url: string; token: string }} bridge
   */
  function configFor(bridge) {
    const headers = { Authorization: `Bearer ${bridge.token}` };
    const names = [tools.SERVER, ...servers];
    const skills = ext.listSkills(host.pluginDir, host.log).length > 0;
    /** @type {Record<string, unknown>} */
    const permission = { "*": "deny", ...Object.fromEntries(names.map((name) => [`${prefixOf(name)}*`, "allow"])), ...(skills ? { skill: "allow" } : {}) };
    return {
      $schema: "https://opencode.ai/config.json",
      autoupdate: false,
      share: "disabled",
      snapshot: false,
      default_agent: AGENT,
      skills: { paths: [join(host.pluginDir, "skills")] },
      mcp: Object.fromEntries(
        names.map((name) => [name, { type: "remote", url: name === tools.SERVER ? bridge.url : `${bridge.url}/${encodeURIComponent(name)}`, headers, oauth: false }]),
      ),
      agent: {
        [AGENT]: {
          mode: "primary",
          description: "The course-authoring assistant of the Edukors Graph Editor.",
          // The whole prompt goes with each message; this only says what follows.
          prompt: "You are the course-authoring assistant of the Edukors Graph Editor. The instructions that follow describe the editor, the tools of this session and the scope of your work.",
          permission,
        },
      },
    };
  }

  /** @param {any} ev */
  function emit(ev) {
    if (conv) host.emit(conv.sid, ev);
  }

  /**
   * A request to the running server.
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @param {number} [timeout]
   */
  async function api(method, path, body, timeout = 30_000) {
    if (!server) throw new Error("the OpenCode server is not running");
    const res = await fetch(server.url + path, {
      method,
      headers: { authorization: server.auth, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`OpenCode ${method} ${path.split("?")[0]}: ${res.status} ${text.slice(0, 500)}`);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** What OpenCode asks while it works. Its own permissions deny all of it but the bridge, so anything that asks is refused. */
  async function onAsked(/** @type {any} */ event) {
    const props = event.properties ?? {};
    if (event.type === "permission.asked") {
      host.log("opencode asked for permission:", props.permission, JSON.stringify(props.patterns ?? []).slice(0, 200));
      await api("POST", `/permission/${encodeURIComponent(props.id)}/reply`, { reply: "reject", message: "The Edukors Graph Editor does not allow this." }).catch((e) => host.log("opencode permission:", e));
    } else if (event.type === "question.asked") {
      await api("POST", `/question/${encodeURIComponent(props.id)}/reject`, {}).catch((e) => host.log("opencode question:", e));
    }
  }

  /** @param {any} event */
  function onEvent(event) {
    const sid = event?.properties?.sessionID ?? event?.properties?.info?.sessionID ?? event?.properties?.part?.sessionID;
    if (!conv || sid !== conv.sid) return;
    if (event.type === "permission.asked" || event.type === "question.asked") {
      void onAsked(event);
      return;
    }
    for (const ev of mapper?.map(event) ?? []) emit(ev);
  }

  /**
   * The server's stream of events, read as long as the server lives. It says
   * hello first, which is when the server is ready to be spoken to.
   * @param {{ url: string; auth: string }} at
   * @param {() => void} ready
   */
  async function listen(at, ready) {
    const controller = new AbortController();
    listening = controller;
    while (!controller.signal.aborted && server === at) {
      try {
        const res = await fetch(`${at.url}/event`, { headers: { authorization: at.auth, accept: "text/event-stream" }, signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`events: ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let cut;
          while ((cut = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = chunk
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            let event;
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }
            if (event?.type === "server.connected") ready();
            else onEvent(event);
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        host.log("opencode events:", /** @type {Error} */ (e)?.message ?? e);
      }
      // The stream ended with the server still there: it is read again.
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  function stopServer() {
    listening?.abort();
    listening = null;
    server = null;
    const running = child;
    child = null;
    running?.kill();
  }

  /** The server, started once and kept until this process goes or the person's servers change. */
  function ensureServer() {
    if (server && child && child.exitCode === null) return Promise.resolve();
    starting ??= (async () => {
      const path = await findOpencode();
      if (!path) throw Object.assign(new Error("OpenCode was not found"), { code: "opencode-missing" });
      const bridge = await host.bridge();
      mkdirSync(workspace, { recursive: true });
      const password = randomUUID().replaceAll("-", "");
      const env = {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(configFor(bridge)),
        OPENCODE_SERVER_USERNAME: "opencode",
        OPENCODE_SERVER_PASSWORD: password,
        // The person's Claude Code setup and the skills of other agents are theirs, not this editor's.
        OPENCODE_DISABLE_CLAUDE_CODE: "1",
        OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
        OPENCODE_DISABLE_AUTOUPDATE: "1",
        OPENCODE_DISABLE_SHARE: "1",
        OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
      };
      const args = ["serve", "--hostname", "127.0.0.1", "--port", "0"];
      // The person's plugins could run anything at all; the editor's agent does without them.
      if ((await helpOf(path)).includes("--pure")) args.push("--pure");
      const shell = WINDOWS && /\.(cmd|bat)$/i.test(path);
      const started = spawn(shell ? `"${path}"` : path, args, { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell });
      child = started;
      stderrTail = [];
      const tail = (/** @type {unknown} */ chunk) => {
        const text = String(chunk);
        host.log("opencode:", text.trimEnd());
        stderrTail.push(text);
        if (stderrTail.length > 40) stderrTail.shift();
      };
      started.stderr.on("data", tail);
      const url = await new Promise((resolve, reject) => {
        let said = "";
        const timer = setTimeout(() => reject(new Error("OpenCode did not say where it listens")), START_MS);
        started.stdout.on("data", (chunk) => {
          said += String(chunk);
          const at = /listening on (https?:\/\/[^\s]+)/.exec(said)?.[1];
          if (at) {
            clearTimeout(timer);
            resolve(at.replace(/\/$/, ""));
          } else if (said.length > 4000) said = said.slice(-2000);
        });
        started.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        started.once("exit", (code, signal) => {
          clearTimeout(timer);
          reject(new Error(stderrTail.join("").trim().slice(-2000) || said.trim().slice(-2000) || `opencode stopped (${signal ?? code})`));
        });
      }).catch((e) => {
        if (child === started) child = null;
        started.kill();
        throw Object.assign(new Error(String(e?.message ?? e)), { code: "opencode-failed" });
      });
      started.stdout.on("data", tail);
      started.on("exit", (code, signal) => {
        if (child === started) {
          child = null;
          server = null;
          listening?.abort();
          listening = null;
        }
        if (mapper?.inTurn) {
          mapper.inTurn = false;
          emit({ ev: "turn_end", status: "error", code: "opencode_exit", text: stderrTail.join("").trim().slice(-2000) || `opencode stopped (${signal ?? code})` });
        }
        if (conv) host.ended(conv.sid, "the OpenCode server stopped");
        conv = null;
      });
      const at = { url: String(url), auth: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` };
      server = at;
      modelCache = null;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 10_000);
        void listen(at, () => {
          clearTimeout(timer);
          resolve(undefined);
        });
      });
    })().finally(() => (starting = null));
    return starting;
  }

  async function models() {
    if (modelCache) return modelCache;
    const [list, config] = await Promise.all([api("GET", "/config/providers"), api("GET", "/config").catch(() => null)]);
    modelCache = parseModels(list, typeof config?.model === "string" ? config.model : undefined);
    return modelCache;
  }

  /** @returns {Promise<{ provider: string; signedIn: boolean; plan?: string }>} */
  async function account() {
    try {
      const usable = usableProviders(await api("GET", "/config/providers"));
      return { provider: id, signedIn: usable.length > 0, ...(usable.length ? { plan: usable.map((/** @type {any} */ p) => String(p.name ?? p.id)).join(", ") } : {}) };
    } catch (e) {
      host.log("opencode account:", e);
      return { provider: id, signedIn: false };
    }
  }

  /** The model a message goes to: the one chosen, or the one the default stands for. */
  async function modelFor(/** @type {string | undefined} */ chosen) {
    const list = await models();
    const value = chosen && chosen !== "default" && list.some((m) => m.value === chosen) ? chosen : list[0]?.resolved;
    if (!value) return undefined;
    const slash = value.indexOf("/");
    return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1), efforts: list.find((m) => m.value === value)?.efforts ?? [] };
  }

  return {
    capabilities,

    /** @param {any} opts */
    async open(opts) {
      await this.close();
      // The server reads its MCP servers when it starts: another set of them starts it again.
      const names = await host.personalServers(opts.mcp);
      if (names.join("\n") !== servers.join("\n")) {
        servers = names;
        stopServer();
      }
      await ensureServer();
      const who = await account();
      if (!who.signedIn) {
        // OpenCode reads the person's credentials when it starts, so the next try, after they sign in, starts it again.
        stopServer();
        return { sessionId: "", resumed: false, account: who, models: [], mcp: host.serverStates(), skills: [] };
      }
      const session = opts.resume ? await api("GET", `/session/${encodeURIComponent(opts.resume)}`) : await api("POST", "/session", {});
      const sid = String(session?.id ?? "");
      if (!sid) throw new Error("OpenCode opened no session");
      mapper = createMapper({ ownsTool });
      conv = {
        sid,
        model: opts.model && opts.model !== "default" ? opts.model : undefined,
        effort: opts.effort && opts.effort !== "auto" ? opts.effort : undefined,
        instructions: opts.instructions,
      };
      return { sessionId: sid, resumed: Boolean(opts.resume), account: who, models: await models(), mcp: host.serverStates(), skills: ext.listSkills(host.pluginDir, host.log) };
    },

    /** @param {string} text */
    async send(text) {
      // The conversation this message belongs to: the one on screen may change while the turn is being started.
      const here = conv;
      if (!here) throw new Error("no conversation open");
      const model = await modelFor(here.model);
      const system = `${host.systemPrompt(id, here.instructions)}\n\n${host.mode() === "plan" ? host.planInstructions(id) : ""}`.trimEnd();
      mapper?.begin();
      try {
        await api(
          "POST",
          `/session/${encodeURIComponent(here.sid)}/prompt_async`,
          {
            agent: AGENT,
            system,
            parts: [{ type: "text", text }],
            ...(model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
            ...(model && here.effort && model.efforts.includes(here.effort) ? { variant: here.effort } : {}),
          },
          60_000,
        );
      } catch (e) {
        if (mapper) mapper.inTurn = false;
        throw e;
      }
      return { sessionId: here.sid };
    },

    async interrupt() {
      if (!conv || !server) return;
      await api("POST", `/session/${encodeURIComponent(conv.sid)}/abort`).catch((e) => host.log("opencode interrupt:", e));
    },

    /** @param {{ model?: string; effort?: string }} req */
    async set(req) {
      if (!conv) return;
      // The model, the effort and the mode go with each message, so they take effect on the next one.
      if (req.model) conv.model = req.model === "default" ? undefined : req.model;
      if (req.effort) conv.effort = req.effort === "auto" ? undefined : req.effort;
    },

    async close() {
      conv = null;
      mapper = null;
    },

    /** The editor's sessions: OpenCode keeps every folder's that is not a project together, so only this workspace's are listed. */
    async list() {
      await ensureServer();
      const list = await api("GET", `/session?roots=true&directory=${encodeURIComponent(workspace)}`).catch(() => null);
      // OpenCode keeps the folder as the system resolves it (/private/var for /var).
      const here = new Set([workspace, realpathSync(workspace)]);
      return (Array.isArray(list) ? list : [])
        .filter((/** @type {any} */ s) => s?.id && here.has(s.directory) && !s.parentID && !s.time?.archived)
        .map((/** @type {any} */ s) => ({
          id: String(s.id),
          ...(titleOf(s) ? { title: titleOf(s) } : {}),
          lastModified: Number(s.time?.updated ?? s.time?.created ?? 0),
        }))
        .sort((/** @type {{ lastModified: number }} */ a, /** @type {{ lastModified: number }} */ b) => b.lastModified - a.lastModified);
    },

    /** @param {string} sid */
    async history(sid) {
      await ensureServer();
      return historyEvents(await api("GET", `/session/${encodeURIComponent(sid)}/message`, undefined, 60_000), { qualify });
    },

    /** @param {string} sid */
    async remove(sid) {
      await ensureServer();
      if (conv?.sid === sid) await this.close();
      await api("DELETE", `/session/${encodeURIComponent(sid)}`);
    },

    /** The person connects a provider in OpenCode itself, in a terminal: it opens the browser from there when the provider signs in that way. */
    async login() {
      const path = await findOpencode();
      if (!path) throw Object.assign(new Error("OpenCode was not found"), { code: "opencode-missing" });
      // What the server read of the person's credentials is old once they sign in.
      stopServer();
      return openTerminal(`"${path}" auth login`);
    },
  };
}
