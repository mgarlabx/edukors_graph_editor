# Changelog

Each version has its own section, written before the tag, **always in English**: its text goes to the release page on GitHub and to the update notice that versions 2.x show (`scripts/release-notes.mjs`, `scripts/tauri-update.mjs`). A section changed after the release does not reach that notice.

## 26.11.5

A new editor, on the same foundation as the other Edukors apps. Versions are now numbered by date (YY.M.D).

- **Same interface as the other Edukors apps:** title bar, toolbar, course tabs, Open/Save/Recent, settings, help, terms, light/dark/system theme, interface size and the update notice now come from Edukors Common, as in the Slides Editor. The toolbar groups File (new, open, recent, save, export, folder), View (map, EGF, preview, preview with map), undo/redo, clipboard, new step, fit and problems; auto-layout stays on ⇧⌘L. "Preferences" is now **Settings**.
- **New course file `.egrx`.** Save writes the course, its map layout and its AI conversations to one `.egrx` file. An `.egf` (or an older `.json`) opens as an import and is never overwritten by Save. The course inside is exactly the `.egf` course: nothing about the format of courses changed.
- **Export** (toolbar) writes **Course (.egf)**, for the player and the gallery, or **Player (HTML)**, next to the `.egrx`, with its name; an existing file is replaced only after you confirm.
- **AI assistant from Edukors Common:** Claude Code or Codex, the AI accounts shared with the other Edukors apps, models and effort, a *Plan* mode that only reads and proposes, skills, and conversations kept with each course. **Node.js is no longer needed.** Antigravity, Kiro, Kimi Code, OpenCode and the editor's own MCP servers are gone.
- **Your 2.20 data comes along** on the first start: settings, AI settings and skills, accepted terms, recent files that still exist, language and theme. Conversations of 2.19–2.20 about a course appear in its history when you open its `.egf`. **The preview's OpenRouter key is not carried over:** paste it once in **Settings → Preview AI**. The 2.20 data folder stays as it was.
- **Updating from 2.20:** this update replaces the app. On Windows, the installer removes 2.20 first (outside the Microsoft Store); on Linux, the `.deb` upgrades the 2.20 package. From now on, the app tells you when a new version is out and links to it; it no longer installs updates by itself. The Microsoft Store keeps updating its copy.
- **Going back:** version 2.20 does not open `.egrx` files. To take a course back to it, export it as `.egf`.
- **Smaller changes:** the map language is set only in the inspector's text language bar; the preview's calls panel opens with its own button and starts closed; the preview's OpenRouter key is kept encrypted by the system and never reaches the page; the page runs under a strict content security policy, with the player and previews in their own sandboxed frames.

## 2.20.0

- **AI assistant, same look as the Slides editor:** accounts, service setup, model and effort, usage, the conversation list and the panel header now come from the shared EDUKORS interface (`@edukors/ai-ui` 0.1.4, on `@edukors/ai-cli` 0.2.2), in Portuguese, English and Spanish. "AI agent" is now "AI assistant" and "Preferences" is now "Settings".
- **Installing Claude Code or Codex:** when a service is missing, the settings show its official guide and the install command for your system, to copy; the editor never runs it.
- **Conversations follow the document:** a new conversation belongs to the course open when it starts, and the list shows that course's conversations. Earlier conversations open for reading; start a new one to work on the current course. A request in progress stays on its course even if you switch tabs.
- **Accounts refresh** when you come back to the editor, so an account added or removed in another EDUKORS app shows up.
- **Recent files:** a recent file that was moved or deleted shows "File not found", with the choice to remove it from the list.
- **Node.js 22.12 or later** is now required for the AI assistant (the shared library's minimum).

## 2.19.0

- **AI accounts:** the agent now runs on an AI account you add in **Preferences → AI agent → AI accounts** (Claude Code or Codex), with its own sign-in, separate from the one you may use in a terminal. Accounts are shared with the other EDUKORS apps on this computer. When the browser does not open for the sign-in, the editor shows the address and, for Claude, a field for the code shown after you authorize.
- **Same agent everywhere:** the providers, accounts and sessions are handled by the shared EDUKORS AI library (`@edukors/ai-cli`), which the Slides editor will use too.
- **Advanced:** instructions, MCP servers and skills now sit under **Advanced**, below the accounts. Every MCP server works with both providers, and each call to one waits for your approval as edits do. Codex now reads the editor's skills too.
- **Attached files:** text files attached to a message are sent with it, since the agent no longer reads files on its own.
- **Conversations** are saved by the editor and reopened as they were on screen, on the account they ran on.
- **Removed:** Antigravity, Kiro, Kimi Code and OpenCode, until they are available in the shared library; the agent's shell and file tools; reading conversations from the providers' own history.

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
