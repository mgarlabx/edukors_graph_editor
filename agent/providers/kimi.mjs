// @ts-check
/**
 * The agent on Moonshot's Kimi Code CLI (`kimi`), through its ACP server
 * (`kimi acp`, agent/providers/acp.mjs), with the Kimi account the CLI is
 * signed in with (`kimi login`) or the providers the person set up in it.
 *
 * It is the person's own install (`~/.kimi-code/bin/kimi`), never bundled.
 * The Python `kimi-cli` that came before it (1.x) is not it: it is no longer
 * maintained, and is reported as missing.
 *
 * What the editor sets up for it: a home of its own under the app's data
 * folder (KIMI_CODE_HOME), so that the person's own Kimi setup is never
 * touched. In it, SYSTEM.md is the editor's system prompt, and config.toml is
 * the person's (where the login puts the account's provider and models) with
 * the editor's rules on top: every session asks before acting, the editor's
 * skills are the ones it reads, and the tools that would write a file, plan
 * in a file of their own or ask the person on their own are turned off; the
 * editor's bridge gives it the course, and asks. The sign-in itself is
 * borrowed: the credentials folder is the person's, linked in, so that the
 * account the CLI refreshes is one and the same.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as tools from "../tools.mjs";
import { findCli, versionOf, WINDOWS } from "../cli.mjs";
import { createAcp } from "./acp.mjs";

export const id = "kimi";

export const capabilities = { efforts: true, usage: false, bash: true, skills: true, mcp: true, login: "external", ownQuestions: false };

const BINARY = "kimi";

/** Where the installer puts it, then npm's and the usual places, which a Finder-launched app does not have on its PATH. */
const places = () =>
  WINDOWS
    ? [join(homedir(), ".kimi-code", "bin", "kimi.exe"), join(process.env.APPDATA ?? "", "npm", "kimi.cmd")]
    : [join(homedir(), ".kimi-code", "bin", BINARY), "/opt/homebrew/bin/kimi", "/usr/local/bin/kimi", join(homedir(), ".npm-global", "bin", BINARY), join(homedir(), ".local", "bin", BINARY)];

/** @type {string | null | undefined} */
let found;
/** @type {string | undefined} */
let foundVersion;

async function findKimi() {
  if (found === undefined) {
    const path = await findCli({ binary: BINARY, envVar: "EDUKORS_KIMI", places: places() });
    foundVersion = path ? await versionOf(path) : undefined;
    // The old Python kimi-cli answers to the same name and has no `acp` of this kind.
    found = path && Number(foundVersion?.split(".")[0] ?? 0) >= 2 ? path : null;
  }
  return found;
}

export async function detect() {
  const path = await findKimi();
  if (!path) return { available: false, reason: "missing", ...(foundVersion ? { detail: `kimi ${foundVersion} is the old kimi-cli; Kimi Code is 2.0 or later` } : {}) };
  return { available: true, path, ...(foundVersion ? { version: foundVersion } : {}) };
}

/** The person's own Kimi home, where `kimi login` keeps the account. */
const theirs = () => process.env.EDUKORS_KIMI_HOME || join(homedir(), ".kimi-code");

/** The settings the editor sets itself: the person's own value for any of them is left out. */
const OURS = ["default_permission_mode", "default_plan_mode", "merge_all_available_skills", "builtin_product_skills", "extra_skill_dirs", "extra_agent_dirs"];
/** The tables the editor writes itself, or that would run something of the person's (hooks). */
const DROPPED = /^\s*\[\[?\s*(tools|permission|hooks)(\.[^\]]*)?\s*\]\]?\s*(#.*)?$/;

/**
 * The person's config.toml without what the editor sets: its providers and
 * models stay, which is how an account or an API key reaches the agent.
 * @param {string} text
 */
export function sanitizeConfig(text) {
  const out = [];
  let table = false;
  let dropping = false;
  let openArray = false;
  for (const line of text.split(/\r?\n/)) {
    if (openArray) {
      if (line.includes("]")) openArray = false;
      continue;
    }
    if (/^\s*\[/.test(line)) {
      table = true;
      dropping = DROPPED.test(line);
      if (dropping) continue;
    }
    if (dropping) continue;
    const key = !table && /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
    if (key && OURS.includes(key)) {
      const value = line.slice(line.indexOf("=") + 1);
      openArray = value.includes("[") && !value.includes("]");
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

/** The person's credentials folder, linked into the editor's home, so that the sign-in is theirs. */
function borrowSignIn(/** @type {string} */ home, /** @type {(...args: unknown[]) => void} */ log) {
  const target = join(theirs(), "credentials");
  const link = join(home, "credentials");
  if (!existsSync(target)) return;
  try {
    const here = lstatSync(link, { throwIfNoEntry: false });
    if (here?.isSymbolicLink()) return;
    if (here) rmSync(link, { recursive: true, force: true });
    symlinkSync(target, link, WINDOWS ? "junction" : "dir");
  } catch (e) {
    log("kimi sign-in not linked:", e);
  }
}

/**
 * @param {import("../host").Host} host
 */
export function create(host) {
  const instance = createAcp(
    {
      id,
      name: "Kimi Code CLI",
      find: findKimi,
      args: ["acp"],
      env: () => {
        const env = { ...process.env, KIMI_CODE_HOME: join(host.cwd, id, "home") };
        delete env.ANTHROPIC_API_KEY;
        delete env.OPENAI_API_KEY;
        delete env.GEMINI_API_KEY;
        return env;
      },
      prepare({ home, prompt }) {
        const kimiHome = join(home, "home");
        mkdirSync(kimiHome, { recursive: true });
        borrowSignIn(kimiHome, host.log);
        let mine = "";
        try {
          mine = sanitizeConfig(readFileSync(join(theirs(), "config.toml"), "utf8"));
        } catch {
          /* nobody has set Kimi up yet: the login will */
        }
        const skills = join(host.pluginDir, "skills");
        const config = [
          "# Written by the Edukors Graph Editor at every start; changes here are lost.",
          "# The providers and models below are copied from the person's own ~/.kimi-code/config.toml.",
          'default_permission_mode = "manual"',
          "default_plan_mode = false",
          "merge_all_available_skills = false",
          "builtin_product_skills = false",
          `extra_skill_dirs = [${JSON.stringify(skills)}]`,
          "",
          mine,
          "",
          "[tools]",
          `disabled = ${JSON.stringify(["Write", "Edit", "EnterPlanMode", "ExitPlanMode", "AskUserQuestion", "Agent", "AgentSwarm", "CronCreate", "CronDelete", "TaskStop"])}`,
          "",
        ].join("\n");
        writeFileSync(join(kimiHome, "config.toml"), config);
        // SYSTEM.md replaces Kimi's own prompt whole; the skills it finds are put back in.
        writeFileSync(join(kimiHome, "SYSTEM.md"), `${prompt}\n\n\${skills_section}\n`);
        return `${config}\n${prompt}`;
      },
      // The editor's server and each of the person's, all on the bridge, given with each session.
      mcpServers: (bridge, servers) =>
        [tools.SERVER, ...servers].map((name) => ({
          type: "http",
          name,
          url: name === tools.SERVER ? bridge.url : `${bridge.url}/${encodeURIComponent(name)}`,
          headers: [{ name: "Authorization", value: `Bearer ${bridge.token}` }],
        })),
      // The login goes to the person's own home, which the editor's borrows.
      login: (path) => `${JSON.stringify(path)} login`,
    },
    host,
  );
  return { capabilities, ...instance };
}
