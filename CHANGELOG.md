# Changelog

Each version has its own section, written before the tag, **always in English**: its text goes to the release page on GitHub and to the update notice inside the app (`scripts/release-notes.mjs`). A section changed after the build does not reach the app.

## 2.18.0

- **Preview with map:** a fourth view (⇧⌘P, also in **View**) runs the same preview with the course map beside it, as students see it on the platform. The map marks the steps already taken and the path walked, and follows the current step; the arrows between the two halves give either one the whole width. Switching between **Preview** and **Preview with map** keeps the student where they are.
- **Kiro (AWS):** the Kiro option in **Preferences → AI agent → Provider** now reads "Kiro (AWS)".
- **edukors.org in the toolbar:** the Edukors logo at the left of the toolbar opens edukors.org in the browser.

## 2.17.0

- **Kiro and Kimi Code as the AI agent:** the agent panel can now run on [Kiro](https://kiro.dev/docs/cli/installation/) (`kiro-cli`, signed in with `kiro-cli login`) and on [Kimi Code](https://moonshotai.github.io/kimi-code/en/guides/getting-started.html) (`kimi`, signed in with `kimi login`, or with the providers set up in it). Both are your own install, like the other agents, and work with the editor's skills and your MCP servers. Kimi Code can run read-only commands, each one put to you first; Kiro works through the editor's tools only. The older Python `kimi-cli` is not supported.
- **Agent order:** **Preferences → AI agent → Provider** now lists Claude Code (the default), Codex, Antigravity, Kiro, Kimi Code and OpenCode.

## 2.16.0

- **Claude Code is now your own install**, like the other AI agents: the editor uses the Claude Code installed on your computer instead of carrying its own copy, so the installers are hundreds of megabytes smaller and Claude Code keeps itself up to date. If it is missing, the agent panel shows **See how to install**; if it is too old, the panel asks you to update it (`claude update`).
- **Skills on Codex:** the skills added in **Preferences → AI agent** now work with Codex too, as with the other agents. Codex's own built-in skills and the ones in your personal Codex setup stay out of the editor.
- **Any language for a course:** in **Languages**, **Other language…** adds any ISO 639-1 code, with an optional region (such as `ko` or `pt-BR`), beyond the ones offered. Renaming a language's code is no longer offered there.
- **A prompt written once:** a dynamic page's prompt can be written in a single language and left blank in the others; a blank one runs the prompt written in another language, and the validator no longer reports it as empty text.

## 2.15.0

- **Claude Code is the default AI agent again** on a new install, since it comes inside the editor; existing installs keep the agent they chose.
- **Claude Code sign-in:** on a computer where Claude Code was never logged in, the agent panel now shows the sign-in card (with **Open Terminal**) instead of opening a conversation that fails with "Not logged in · Please run /login".

## 2.14.1

- **Windows:** the AI agent no longer stops as it starts ("The agent process stopped while starting", with `EISDIR: illegal operation on a directory, lstat 'C:'`).

## 2.14.0

- **OpenCode as the AI agent:** the agent panel can now run on [OpenCode](https://opencode.ai), with any provider connected to it (`opencode auth login`): OpenCode Zen or Go, a ChatGPT or Copilot plan, or an API key. It is the first option in **Preferences → AI agent → Provider** and the default on a new install; existing installs keep the agent they had. OpenCode Zen's free models only answer OpenCode's own agent, so they are not offered.
- **Linux version:** the editor now runs on Linux (x64), as a `.deb` for Debian, Ubuntu, Mint and their relatives, and as an AppImage for other distributions. It updates itself like the Mac and Windows versions; the OpenRouter key goes in the desktop's keyring, and with the `.deb`, double-clicking an `.egf` opens it in the editor.

## 2.13.1

- **Signed Mac app:** the app is now signed and notarized by Apple. Downloaded from the browser, it opens without the security warning and without a trip to System Settings → Privacy & Security. On updating to this version, macOS may ask one last time for your password to let the editor read its saved key; choose **Always Allow**.

## 2.13.0

- **Full-screen preview:** a new button in the Preview tab shows the course as the student sees it, with no editor around it. Press Esc or the button in the corner to return.
- **Inspector in tabs:** the course, node and edge inspectors are now split into three tabs (**Data**, **Specs** and **Extras**), so each section is shorter and easier to find.
- The AI temperature setting was removed from Preferences.

## 2.12.0

- The editor now updates itself: upon opening, it checks for new versions (once a day) and asks before installing. You can also check via the menu, under **Check for updates…**, and disable automatic checking in Preferences.
