// @ts-check
/**
 * The agent on Google's Antigravity CLI (`agy`), which is how the Google AI
 * Pro subscription reaches the editor: the CLI signs in with the person's
 * Google account and keeps the credentials in the system keyring, as Claude
 * Code does with the Claude account.
 *
 * It is the person's own install (`~/.local/bin/agy`), never bundled: the
 * editor finds it, says so when it is missing, and points at the install page.
 *
 * How a turn runs. The CLI is spawned in headless streaming mode, one JSON
 * object per line each way, in a workspace of its own under the app's data
 * folder. It is given no tools of its own: a custom agent with `tools: []`,
 * whose instructions are the editor's system prompt, and one MCP server, the
 * editor's bridge (agent/mcpBridge.mjs). In headless mode the CLI asks the
 * person nothing and auto-denies whatever would have been asked, so it is run
 * with its own permission prompts off and every call is decided by the
 * editor's gate instead. What keeps that honest is a guard the CLI runs before
 * each tool call (antigravityGuard.mjs): a call that is not to the editor's
 * server is refused there, whatever the CLI makes of its configuration.
 *
 * What the CLI keeps of a conversation is its own; the editor writes its own
 * journal (agent/journal.mjs) so the panel can list and reopen them, and keeps
 * the CLI's conversation id to carry on where it left off.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { findCli, helpOf, run, versionOf, WINDOWS } from "../cli.mjs";
import * as tools from "../tools.mjs";
import * as ext from "../extensions.mjs";
import { journal } from "../journal.mjs";
import { openTerminal } from "../terminal.mjs";
import { authFailure, createMapper, parseModels } from "./antigravityEvents.mjs";

export const id = "antigravity";

export const capabilities = { efforts: false, usage: false, bash: false, skills: true, mcp: false, login: "external", ownQuestions: false };

/** The agent the CLI is run as, written into the workspace at every open. */
const AGENT = "edukors";
/** How long the CLI has to say hello before the panel gives up on it. */
const INIT_MS = 25_000;
/** A turn may take as long as the person lets it; the CLI's own limit is set out of the way. */
const PRINT_TIMEOUT = "12h";
/** The guard the CLI runs before each tool call, which ships with the agent. */
const GUARD = fileURLToPath(new URL("./antigravityGuard.mjs", import.meta.url));

const BINARY = "agy";

/** Where the CLI installs itself, which a Finder-launched app does not have on its PATH. */
const places = () =>
  WINDOWS
    ? [join(process.env.LOCALAPPDATA ?? "", "agy", "bin", "agy.exe")]
    : [join(homedir(), ".local", "bin", BINARY), "/opt/homebrew/bin/agy", "/usr/local/bin/agy"];

/** @type {string | null | undefined} */
let found;

/** The CLI on this machine, or null. Looked up once per process. */
async function findAgy() {
  if (found === undefined) found = await findCli({ binary: BINARY, envVar: "EDUKORS_AGY", places: places() });
  return found;
}

export async function detect() {
  const path = await findAgy();
  if (!path) return { available: false, reason: "missing" };
  const version = await versionOf(path);
  return { available: true, path, ...(version ? { version } : {}) };
}

/** @type {{ value: string; displayName: string }[] | null} */
let modelCache = null;

async function models(/** @type {string} */ path) {
  if (modelCache) return modelCache;
  const { stdout, stderr } = await run(path, ["models"], 20_000);
  const parsed = parseModels(stdout.trim() ? stdout : stderr);
  modelCache = parsed;
  return parsed;
}

/**
 * @param {import("../host").Host} host
 */
export function create(host) {
  const workspace = join(host.cwd, "antigravity");
  const agents = join(workspace, ".agents");
  const jrn = journal(join(workspace, "transcripts"));

  /** @type {{ sid: string; agyId: string | null; model?: string; instructions?: string; live: boolean } | null} */
  let conv = null;
  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
  let child = null;
  /** @type {ReturnType<typeof createMapper> | null} */
  let mapper = null;
  /** The command line is read at every spawn, so a change of model or mode takes effect. */
  let needsRespawn = false;
  let turnOpen = false;
  let interrupting = false;
  /** @type {string[]} */
  let stderrTail = [];
  /** @type {(() => void) | null} */
  let waitingForInit = null;

  host.onExit(() => child?.kill("SIGKILL"));

  /**
   * Whether a tool call in the CLI's stream is one the editor already shows.
   * The CLI does not offer an MCP tool by name: it has one tool of its own
   * that calls any of them, so the server it names is what tells.
   * @param {string} name
   * @param {Record<string, unknown>} [parameters]
   */
  const ownsTool = (name, parameters = {}) => {
    const plain = name.replace(/^mcp__/, "").replace(new RegExp(`^${tools.SERVER}__`), "").replace(new RegExp(`^${tools.SERVER}[./]`), "");
    if (tools.TOOLS.some((t) => t.name === plain || name === tools.qualified(t.name))) return true;
    const server = parameters.ServerName ?? parameters.server_name ?? parameters.serverName ?? parameters.server;
    return typeof server === "string" && server === tools.SERVER;
  };

  /** The person's instructions and the mode, as the agent the CLI runs as. */
  function writeWorkspace(/** @type {{ instructions?: string; model?: string }} */ opts, /** @type {{ url: string; token: string }} */ bridge) {
    mkdirSync(join(agents, "agents", AGENT), { recursive: true });
    const prompt = `${host.systemPrompt(id, opts.instructions)}\n\n${host.mode() === "plan" ? host.planInstructions(id) : ""}`.trimEnd();
    const front = ["---", `name: ${AGENT}`, "description: The course-authoring assistant of the Edukors Graph Editor.", "tools: []", "excludeDefaultComponents: true", "---", ""].join("\n");
    writeFileSync(join(agents, "agents", AGENT, "agent.md"), `${front}\n${prompt}\n`);
    writeFileSync(
      join(agents, "mcp_config.json"),
      JSON.stringify({ mcpServers: { [tools.SERVER]: { serverUrl: bridge.url, headers: { Authorization: `Bearer ${bridge.token}` } } } }, null, 2) + "\n",
    );
    // The guard, before every tool call: the CLI runs with its own prompts off,
    // so this is what says no to anything that is not the editor's own tool.
    const guard = { type: "command", command: `"${process.execPath}" "${GUARD}" ${tools.SERVER}`, timeout: 15 };
    writeFileSync(join(agents, "hooks.json"), JSON.stringify({ [`${tools.SERVER}-guard`]: { PreToolUse: [{ matcher: ".*", hooks: [guard] }] } }, null, 2) + "\n");
    // The person's skills, copied in as the CLI's own, so it finds them where it looks.
    const from = join(host.pluginDir, "skills");
    const to = join(agents, "skills");
    rmSync(to, { recursive: true, force: true });
    try {
      if (existsSync(from)) cpSync(from, to, { recursive: true });
    } catch (e) {
      host.log("skills for agy:", e);
    }
  }

  /**
   * The events the journal keeps: what a conversation is made of once it has
   * settled. The stream of an answer being written is not kept, since the
   * complete answer follows it.
   */
  const KEPT = new Set(["user", "assistant", "tool_result", "notice", "divider", "interrupted", "turn_end"]);

  /** What the panel shows and the journal keeps. @param {any} ev */
  function emit(ev) {
    if (!conv) return;
    host.emit(conv.sid, ev);
    if (KEPT.has(ev.ev)) jrn.append(conv.sid, ev);
  }

  /**
   * Stops the CLI and waits for it to go: only one of them may hold a
   * conversation's file at a time, so the next one starts after this one ends.
   * @param {"SIGTERM" | "SIGKILL"} signal
   */
  function stop(signal = "SIGTERM") {
    const dying = child;
    child = null;
    if (!dying || dying.exitCode !== null) return Promise.resolve();
    try {
      dying.stdin.end();
    } catch {
      /* already gone */
    }
    return new Promise((resolve) => {
      const done = setTimeout(() => {
        dying.kill(signal === "SIGTERM" ? "SIGKILL" : signal);
        resolve(undefined);
      }, 2_000);
      const nudge = setTimeout(() => dying.exitCode === null && dying.kill(signal), 700);
      dying.once("exit", () => {
        clearTimeout(done);
        clearTimeout(nudge);
        resolve(undefined);
      });
    });
  }

  /**
   * Starts the CLI for the conversation on screen. It stays up between turns;
   * an interrupt or a change of model brings it back with `--conversation`.
   */
  async function spawnAgy() {
    const path = await findAgy();
    if (!path) {
      const error = new Error("the Antigravity CLI was not found");
      /** @type {any} */ (error).code = "agy-missing";
      throw error;
    }
    const bridge = await host.bridge();
    writeWorkspace({ instructions: conv?.instructions, model: conv?.model }, bridge);
    const flags = await helpOf(path);
    const takes = (/** @type {string} */ flag) => flags.includes(flag);
    const args = ["--input-format", "stream-json", "--output-format", "stream-json"];
    if (takes("--agent")) args.push("--agent", AGENT);
    if (takes("--disable-slash-commands")) args.push("--disable-slash-commands");
    if (takes("--print-timeout")) args.push("--print-timeout", PRINT_TIMEOUT);
    if (takes("--add-dir")) args.push("--add-dir", workspace);
    // Headless mode asks nobody, so what it would ask about it denies. The
    // editor's gate is what decides instead, and the guard hook is what holds
    // the CLI to the editor's own tools.
    if (takes("--dangerously-skip-permissions")) args.push("--dangerously-skip-permissions");
    if (conv?.model && conv.model !== "default" && takes("--model")) args.push("--model", conv.model);
    if (conv?.agyId && takes("--conversation")) args.push("--conversation", conv.agyId);

    const env = { ...process.env };
    delete env.GEMINI_API_KEY;
    delete env.GOOGLE_API_KEY;
    delete env.GOOGLE_GENAI_API_KEY;
    delete env.ANTHROPIC_API_KEY;
    delete env.OPENAI_API_KEY;

    mapper = createMapper({ ownsTool });
    stderrTail = [];
    interrupting = false;
    const started = spawn(path, args, { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    child = started;
    host.log("agy", args.join(" "));

    createInterface({ input: started.stdout }).on("line", (line) => {
      if (!line.trim()) return;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        host.log("agy said:", line.slice(0, 300));
        return;
      }
      const before = mapper?.conversationId ?? null;
      for (const ev of mapper?.map(parsed) ?? []) {
        if (ev.ev === "turn_end") turnOpen = false;
        emit(ev);
      }
      const now = mapper?.conversationId ?? null;
      if (now && now !== before && conv) {
        conv.agyId = now;
        jrn.setMeta(conv.sid, { sid: conv.sid, conversation: now });
      }
      if (parsed.event === "init" && waitingForInit) {
        const done = waitingForInit;
        waitingForInit = null;
        done();
      }
    });
    started.stderr.on("data", (chunk) => {
      const text = String(chunk);
      host.log("agy:", text.trimEnd());
      stderrTail.push(text);
      if (stderrTail.length > 40) stderrTail.shift();
    });
    started.on("exit", (code, signal) => {
      if (child === started) child = null;
      needsRespawn = true;
      const tail = stderrTail.join("").trim().slice(-2000);
      if (turnOpen) {
        turnOpen = false;
        if (interrupting) emit({ ev: "turn_end", status: "interrupted" });
        else emit({ ev: "turn_end", status: "error", code: "agy_exit", text: tail || `agy stopped (${signal ?? code})` });
      }
      if (waitingForInit) {
        const done = waitingForInit;
        waitingForInit = null;
        done();
      }
    });
    return started;
  }

  /** Waits for the CLI's hello, which carries the conversation's id and the tools it has. */
  function waitForInit(/** @type {import("node:child_process").ChildProcess} */ started) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waitingForInit = null;
        resolve(undefined);
      }, INIT_MS);
      waitingForInit = () => {
        clearTimeout(timer);
        resolve(undefined);
      };
      started.once("error", () => {
        clearTimeout(timer);
        waitingForInit = null;
        resolve(undefined);
      });
    });
  }

  return {
    capabilities,

    /** @param {any} opts */
    async open(opts) {
      await this.close();
      const path = await findAgy();
      if (!path) {
        const error = new Error("the Antigravity CLI was not found");
        /** @type {any} */ (error).code = "agy-missing";
        throw error;
      }
      const sid = opts.resume ?? randomUUID();
      const meta = opts.resume ? jrn.meta(sid) : {};
      conv = { sid, agyId: typeof meta.conversation === "string" ? meta.conversation : null, model: opts.model, instructions: opts.instructions, live: true };
      if (!opts.resume) jrn.start(sid, { sid });
      const list = models(path).catch(() => []);
      const started = await spawnAgy();
      await waitForInit(started);
      const gone = !child;
      const tail = stderrTail.join("").trim();
      // Nothing came back and the CLI is gone: either nobody is signed in, or it could not start at all.
      if (gone && authFailure(tail)) {
        needsRespawn = true;
        return {
          sessionId: sid,
          resumed: Boolean(opts.resume),
          account: { provider: id, signedIn: false },
          models: await list,
          mcp: [],
          skills: ext.listSkills(host.pluginDir, host.log),
        };
      }
      if (gone) {
        const error = new Error(tail.slice(-2000) || "the Antigravity CLI stopped while starting");
        /** @type {any} */ (error).code = "agy-failed";
        conv = null;
        throw error;
      }
      // The CLI answered: the account is whatever it is signed in with, which it does not name.
      return {
        sessionId: sid,
        resumed: Boolean(opts.resume),
        account: { provider: id, signedIn: mapper?.tools ? true : "unknown" },
        models: await list,
        mcp: [],
        skills: ext.listSkills(host.pluginDir, host.log),
      };
    },

    /** @param {string} text @param {string} [uuid] */
    async send(text, uuid) {
      // The conversation this message belongs to: starting the CLI takes a
      // moment, and the one on screen may change while it does.
      const here = conv;
      if (!here) throw new Error("no conversation open");
      if (!child || needsRespawn) {
        await stop();
        const started = await spawnAgy();
        needsRespawn = false;
        await waitForInit(started);
        if (conv !== here) throw new Error("the conversation was closed while the agent was starting");
        if (!child) {
          const tail = stderrTail.join("").trim();
          throw new Error(tail.slice(-2000) || "the Antigravity CLI stopped");
        }
      }
      jrn.append(here.sid, { ev: "user", key: uuid ?? randomUUID(), text });
      turnOpen = true;
      interrupting = false;
      child?.stdin.write(JSON.stringify({ event: "user", message: { content: text } }) + "\n");
      return { sessionId: here.sid };
    },

    /** The CLI has no way in to stop a turn: it is stopped, and the next message starts it again where it was. */
    async interrupt() {
      if (!child) return;
      interrupting = true;
      needsRespawn = true;
      child.kill("SIGINT");
      const dying = child;
      setTimeout(() => {
        if (dying.exitCode === null) dying.kill("SIGTERM");
      }, 3_000);
    },

    /** @param {{ mode?: string; model?: string }} req */
    async set(req) {
      if (!conv) return;
      // The model and the mode are read when the CLI starts, so they take effect on the next message.
      if (req.model && req.model !== conv.model) {
        conv.model = req.model;
        needsRespawn = true;
      }
      if (req.mode) needsRespawn = true;
    },

    async close() {
      if (conv) conv.live = false;
      conv = null;
      turnOpen = false;
      await stop();
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
      jrn.remove(sid);
    },

    /** The person signs in to the CLI itself, in a terminal: it opens the browser from there. */
    login: () => openTerminal("agy"),
  };
}
