// @ts-check
/**
 * Finding and asking after the command-line tools the agent can run on.
 *
 * Only Claude Code travels inside the app. The Antigravity CLI and Codex are
 * the person's own install, so the editor has to find them the way a terminal
 * would: an app opened from the Finder has a short PATH, which is why the
 * usual places are tried by hand and, failing that, the login shell is asked.
 */
import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export const WINDOWS = process.platform === "win32";

/**
 * Runs a command and waits, with a timeout. It never throws: what went wrong
 * is in the answer.
 * @param {string} file
 * @param {string[]} args
 * @param {number} [timeout]
 * @returns {Promise<{ failed: boolean; stdout: string; stderr: string }>}
 */
export const run = (file, args, timeout = 15_000) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8 << 20 }, (error, stdout, stderr) =>
      resolve({ failed: Boolean(error), stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }),
    );
  });

const runnable = (/** @type {string} */ path) => {
  if (WINDOWS) return true;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Where a command is on this machine, or null.
 * @param {{ binary: string; envVar: string; places?: string[] }} opts
 * @returns {Promise<string | null>}
 */
export async function findCli(opts) {
  const binary = WINDOWS && !opts.binary.endsWith(".exe") ? `${opts.binary}.exe` : opts.binary;
  const candidates = [];
  const fromEnv = process.env[opts.envVar];
  if (fromEnv) candidates.push(fromEnv);
  candidates.push(...(opts.places ?? []));
  for (const entry of (process.env.PATH ?? "").split(delimiter)) if (entry) candidates.push(join(entry, binary));
  for (const candidate of candidates) if (existsSync(candidate) && runnable(candidate)) return candidate;
  if (!WINDOWS) {
    const shell = process.env.SHELL || "/bin/zsh";
    const { stdout } = await run(shell, ["-lc", `command -v ${opts.binary}`], 8_000);
    const path = stdout.trim().split("\n").filter(Boolean)[0];
    if (path && existsSync(path)) return path;
  }
  return null;
}

/** The version a CLI prints, as the three numbers in it. @param {string} path */
export async function versionOf(path) {
  const { stdout, stderr } = await run(path, ["--version"], 10_000);
  return `${stdout} ${stderr}`.match(/\d+\.\d+\.\d+/)?.[0];
}

/**
 * The flags a build of a CLI takes, so the editor never passes one it does not
 * know. Read once per process, per path.
 * @param {string} path
 */
export async function helpOf(path) {
  if (!helpCache.has(path)) {
    const { stdout, stderr } = await run(path, ["--help"], 10_000);
    helpCache.set(path, `${stdout}\n${stderr}`);
  }
  return /** @type {string} */ (helpCache.get(path));
}

/** @type {Map<string, string>} */
const helpCache = new Map();
