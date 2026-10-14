// @ts-check
/**
 * Opening a terminal with a command, for the providers whose sign-in happens
 * in one (Claude Code's `claude` → /login, Antigravity's `agy`, OpenCode's
 * `opencode auth login`): the editor
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
  if (process.platform === "darwin") {
    return launch("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(command)}`, "-e", 'tell application "Terminal" to activate']);
  }
  if (process.platform === "win32") {
    return launch(process.env.ComSpec || "cmd.exe", ["/c", "start", "", "cmd", "/k", command]);
  }
  return linuxTerminal(command);
}

/**
 * Linux has no one terminal: Debian's and Ubuntu's alternative first, then
 * GNOME's, KDE's, Xfce's and xterm, the first one there is. The shell stays
 * open after the command, as the Mac's and Windows' do.
 * @param {string} command
 */
async function linuxTerminal(command) {
  const script = `${command}; exec "\${SHELL:-sh}"`;
  const terminals = [
    ["x-terminal-emulator", ["-e", "sh", "-c", script]],
    ["gnome-terminal", ["--", "sh", "-c", script]],
    ["konsole", ["-e", "sh", "-c", script]],
    ["xfce4-terminal", ["-x", "sh", "-c", script]],
    ["xterm", ["-e", "sh", "-c", script]],
  ];
  let last = { opened: false, error: "no terminal found" };
  for (const [file, args] of /** @type {[string, string[]][]} */ (terminals)) {
    last = await launch(file, args);
    if (last.opened) return last;
  }
  return last;
}

/**
 * @param {string} file
 * @param {string[]} args
 * @returns {Promise<{ opened: boolean; error?: string }>}
 */
function launch(file, args) {
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
