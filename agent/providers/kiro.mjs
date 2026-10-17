// @ts-check
/**
 * The agent on Kiro's CLI (`kiro-cli`), through its ACP server (`kiro-cli
 * acp`, agent/providers/acp.mjs), with the account the CLI is signed in with
 * (`kiro-cli login`: Builder ID, Google, GitHub or IAM Identity Center).
 *
 * It is the person's own install (`~/.local/bin/kiro-cli`, or the Mac app's),
 * never bundled.
 *
 * What the editor sets up for it: a workspace of its own under the app's data
 * folder, whose `.kiro/agents/edukors.json` is the agent the CLI runs as. Its
 * prompt is the editor's system prompt; its MCP servers are the editor's
 * bridge (the editor's own and each of the person's, served again there),
 * and not the person's mcp.json; its tools are those servers and reading,
 * which the editor's skills need; and the editor's skills are its resources.
 * The calls to the bridge are allowed up front, since the bridge's gate is
 * what asks the person.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as tools from "../tools.mjs";
import { findCli, run, versionOf, WINDOWS } from "../cli.mjs";
import { createAcp } from "./acp.mjs";

export const id = "kiro";

export const capabilities = { efforts: true, usage: false, bash: false, skills: true, mcp: true, login: "external", ownQuestions: false };

/** The agent the CLI is run as, written into the workspace at every start. */
const AGENT = "edukors";

const BINARY = "kiro-cli";

/** Where the installer puts it, which a Finder-launched app does not have on its PATH. */
const places = () =>
  WINDOWS
    ? [join(process.env.LOCALAPPDATA ?? "", "Kiro-Cli", "kiro-cli.exe"), join(homedir(), ".local", "bin", "kiro-cli.exe")]
    : [join(homedir(), ".local", "bin", BINARY), "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli", "/opt/homebrew/bin/kiro-cli", "/usr/local/bin/kiro-cli"];

/** @type {string | null | undefined} */
let found;

async function findKiro() {
  if (found === undefined) found = await findCli({ binary: BINARY, envVar: "EDUKORS_KIRO", places: places() });
  return found;
}

export async function detect() {
  const path = await findKiro();
  if (!path) return { available: false, reason: "missing" };
  const version = await versionOf(path);
  return { available: true, path, ...(version ? { version } : {}) };
}

/**
 * Who the CLI is signed in as, from `kiro-cli whoami --format json`, which
 * answers `{"account": null}` when nobody is. Without the CLI signed in, its
 * ACP server will not even start.
 * @param {string} path
 * @returns {Promise<{ signedIn: boolean | "unknown"; email?: string; plan?: string }>}
 */
export async function account(path) {
  const { stdout } = await run(path, ["whoami", "--format", "json"], 20_000);
  /** @type {any} */
  let json = null;
  for (const line of stdout.split("\n").reverse()) {
    try {
      json = JSON.parse(line);
      break;
    } catch {
      /* the line before */
    }
  }
  if (!json || typeof json !== "object") return { signedIn: "unknown" };
  const who = json.account ?? null;
  if (!who) return { signedIn: false };
  const email = who.email ?? who.username ?? who.userName ?? who.login;
  const plan = who.license ?? who.accountType ?? who.type ?? who.authKind;
  return { signedIn: true, ...(email ? { email: String(email) } : {}), ...(plan ? { plan: String(plan) } : {}) };
}

/**
 * @param {import("../host").Host} host
 */
export function create(host) {
  const instance = createAcp(
    {
      id,
      name: "Kiro CLI",
      find: findKiro,
      args: ["acp", "--agent", AGENT],
      env: (bridge) => {
        const env = { ...process.env, EDUKORS_MCP_TOKEN: bridge.token };
        delete env.ANTHROPIC_API_KEY;
        delete env.OPENAI_API_KEY;
        delete env.GEMINI_API_KEY;
        return env;
      },
      prepare({ workspace, prompt, bridge, servers }) {
        const dir = join(workspace, ".kiro", "agents");
        mkdirSync(dir, { recursive: true });
        const names = [tools.SERVER, ...servers];
        // The token is not written down: Kiro reads it from the environment it was started with.
        const serve = (/** @type {string} */ name) => ({
          type: "http",
          url: name === tools.SERVER ? bridge.url : `${bridge.url}/${encodeURIComponent(name)}`,
          headers: { Authorization: "Bearer ${EDUKORS_MCP_TOKEN}" },
        });
        const agent = {
          name: AGENT,
          description: "The course-authoring assistant of the Edukors Graph Editor.",
          prompt,
          mcpServers: Object.fromEntries(names.map((name) => [name, serve(name)])),
          tools: [...names.map((name) => `@${name}`), "read"],
          allowedTools: names.map((name) => `@${name}`),
          resources: [`skill://${join(host.pluginDir, "skills").replaceAll("\\", "/")}/**/SKILL.md`],
          includeMcpJson: false,
        };
        const text = JSON.stringify(agent, null, 2) + "\n";
        writeFileSync(join(dir, `${AGENT}.json`), text);
        return text;
      },
      // Kiro is given the servers by its agent's file.
      mcpServers: () => [],
      account,
      login: (path) => `${JSON.stringify(path)} login`,
    },
    host,
  );
  return { capabilities, ...instance };
}
