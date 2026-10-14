# Changelog

Each version has its own section, written before the tag, **always in English**: its text goes to the release page on GitHub and to the update notice inside the app (`scripts/release-notes.mjs`). A section changed after the build does not reach the app.

## Unreleased

- **OpenCode as the AI agent:** the agent panel can now run on [OpenCode](https://opencode.ai), with any provider connected to it (`opencode auth login`): OpenCode Zen or Go, a ChatGPT or Copilot plan, or an API key. It is the first option in **Preferences → AI agent → Provider** and the default on a new install; existing installs keep the agent they had. OpenCode Zen's free models only answer OpenCode's own agent, so they are not offered.

## 2.13.1

- **Signed Mac app:** the app is now signed and notarized by Apple. Downloaded from the browser, it opens without the security warning and without a trip to System Settings → Privacy & Security. On updating to this version, macOS may ask one last time for your password to let the editor read its saved key; choose **Always Allow**.

## 2.13.0

- **Full-screen preview:** a new button in the Preview tab shows the course as the student sees it, with no editor around it. Press Esc or the button in the corner to return.
- **Inspector in tabs:** the course, node and edge inspectors are now split into three tabs (**Data**, **Specs** and **Extras**), so each section is shorter and easier to find.
- The AI temperature setting was removed from Preferences.

## 2.12.0

- The editor now updates itself: upon opening, it checks for new versions (once a day) and asks before installing. You can also check via the menu, under **Check for updates…**, and disable automatic checking in Preferences.
