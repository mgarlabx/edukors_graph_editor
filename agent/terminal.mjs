// @ts-check
/**
 * Opening a terminal with a command, for the providers whose sign-in happens
 * in one (Claude Code's `claude` → /login, Antigravity's `agy`): the editor
 * cannot sign in on the person's behalf, so it puts them in front of the CLI
 * that can, with one click from the panel.
 */
import { spawn } from "node:child_process";

/**
 * Opens the system's terminal running `command`. Resolves once it has been
 * asked for, not once the person is done signing in.
 * @param {string} command
 * @returns {Promise<{ opened: boolean; error?: string }>}
 */
export function openTerminal(command) {
  const [file, args] =
    process.platform === "darwin"
      ? ["osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(command)}`, "-e", 'tell application "Terminal" to activate']]
      : process.platform === "win32"
        ? [process.env.ComSpec || "cmd.exe", ["/c", "start", "", "cmd", "/k", command]]
        : ["x-terminal-emulator", ["-e", command]];
  return new Promise((resolve) => {
    try {
      const child = spawn(file, args, { stdio: "ignore", detached: true, windowsHide: false });
      child.on("error", (e) => resolve({ opened: false, error: String(e?.message ?? e) }));
      child.unref();
      // No error in the first moment means the terminal took it.
      setTimeout(() => resolve({ opened: true }), 300);
    } catch (e) {
      resolve({ opened: false, error: String(/** @type {Error} */ (e)?.message ?? e) });
    }
  });
}
