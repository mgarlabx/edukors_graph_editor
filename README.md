# Edukors Graph Editor

Edukors Graph Editor is a visual *builder* that runs on your computer, for creating and editing adaptive courses in the [Edukors Graph](https://github.com/mgarlabx/edukors_graph) format.

> There is a Mac version and a Windows version (x64). This code can be freely downloaded and modified to produce a Linux version too.

## Part of the Edukors Graph project

[Edukors Graph](https://github.com/mgarlabx/edukors_graph) is an open standard for adaptive courses, linked to the [Edukors.org](https://edukors.org) project. The idea is an old one in education: give each student what they need, taking into account what they already know. To do this, the course is described as a graph. The **nodes** are what the student sees: a text, a video, a quiz, a writing task assessed by AI. The **edges** say where they go next, based on what they have done so far. Students who pass the quiz move on; those who don't receive a different explanation before trying again.

The entire course fits in a single JSON file, and the project is made up of three pieces built around that file:

- the **schema**, which defines the course format;
- the **builder**, this editor, in which courses are created and edited;
- the **player**, a server that delivers courses to students, including inside a learning management system (via LTI 1.3).

The schema and the player live in the [edukors_graph](https://github.com/mgarlabx/edukors_graph) repository. In this editor you see the course as a map and build or adjust it with your own hands, with an AI agent alongside if you wish. The result is the course file itself, which the player opens without any conversion.

## What it is for

The editor was made for teachers and course authors. With it you can:

- design the course path, deciding what the student sees and where they go after each activity;
- write the content of each step, in the course's languages;
- check that the course is correct before publishing it;
- take the course as if you were a student, to see what they will see;
- ask an AI agent to create or change parts of the course for you.

## How it works

**The map.** The course appears on screen as a graph, in the style of tools like n8n: each activity is a box, and the arrows show the possible paths. You can drag, connect, copy and automatically arrange the boxes.

**The inspector.** When you click a box, the side panel shows its content in a form tailored to the type of activity. The rules for each path ("if at least 70% of the quiz was correct") are built from menus, with no need to write code.

**Validation.** The editor checks the course as you work, using the same rules as the repository, and points out each problem right where it is.

**The EGF tab.** If you prefer, you can edit the course file directly in its own tab, which stays in sync with the map.

**The content editor.** The text of a step, or the prompt of an AI step, opens in a full-screen editor with a formatting bar, in Markdown or HTML, one tab per language.

**The preview.** You take the course as a student, using the project's own player. AI activities (generated texts and assessments) work for real when you provide an [OpenRouter](https://openrouter.ai) key, which is stored in the Mac Keychain (on Windows, in the Credential Manager). Without the key, the preview runs in a reduced mode, and you choose the assessment results yourself.

**Course tabs.** Several courses can be open at the same time, and you can copy activities from one to another.

**The AI agent.** A panel on the right provides an AI agent that reads the open course and changes it on request: it writes steps, connects paths, translates, validates and fixes. It can also work on a single text, beside the content editor. By default, each change waits for your approval, each change is one undo step, and there is a *Plan* mode that only proposes. Three agents can answer in the panel: **Claude Code**, which comes inside the editor, and **Antigravity** and **Codex**, which you install yourself. Each one uses your own account in its service, and the panel shows that account's usage limits. Skills and MCP servers, added in Preferences, give the agent extra abilities.

**Export.** File → Export course… produces a single HTML file that runs the course on its own, with no server.

Each course is saved in a single file, `course.egf` (Edukors Graph Format: the course's JSON under its own extension, which the app is associated with), which is also what goes to the player. The Open dialog takes `.egf` only; an older `.json` course becomes one by renaming it. The position of each box on the map is saved in it too, in the node's `position` field, which players ignore.

The teacher's guide explains how to use the editor step by step, in [Portuguese](docs/guia-do-professor.md), [English](docs/guia-do-professor.en.md) and [Spanish](docs/guia-do-professor.es.md). The app shows it under Help → Full guide, in the interface's language; the three files are bundled with it, so keep them in step.

## Installation

The editor runs on macOS 11 or later and on Windows (x64). For now it is built from source, which requires a few tools, all of them free. The commands below are typed in Terminal, on the Mac.

**1. Install the tools.**

- Apple command line tools: `xcode-select --install`
- [Rust](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [Node.js](https://nodejs.org), version 22 or later

**2. Download the project and install the dependencies.**

```sh
git clone https://github.com/mgarlabx/edukors_graph_editor.git
cd edukors_graph_editor
npm install
```

**3. Open the editor.**

```sh
npm run app:dev
```

The first time takes a few minutes, because the app is compiled. After that it is fast.

If you prefer an app to keep in your Applications folder, build it with `npm run app:build`. It needs both Mac targets of Rust, added once with `rustup target add aarch64-apple-darwin x86_64-apple-darwin`. The app is universal (Apple Silicon and Intel) and carries the agent inside it, so it can be copied to any Mac with macOS 11 or later; that Mac only needs Node.js for the agent. The `.app` and `.dmg` are placed in `src-tauri/target/universal-apple-darwin/release/bundle/`. Since the app is not yet signed by Apple, open it the first time with right-click → **Open**.

The Windows installer can only be built on Windows. It is built on GitHub, together with the Mac app, by the release workflow that runs when a version tag is pushed. On a Windows machine with Rust and Node 22, `npm ci && npm run app:build:win` does the same. The installer installs for the current user, without asking for administrator rights, and carries the agent too, so it is large; like the Mac app, it needs Node.js for the agent. It is not signed either: when Windows SmartScreen warns, choose **More info → Run anyway**. See [docs/distribuicao.md](docs/distribuicao.md#windows).

An app installed from a release on GitHub updates itself: on opening, it checks for a new version once a day (this can be turned off in Preferences), and **Check for updates…** in the menu checks at any time. It asks before installing, and asks about unsaved courses first.

The first time it opens, the editor asks you to accept the [terms of use](docs/termos-de-uso.en.md) (the MIT license, explained), which stay under Help → Terms of use.

**4. Optional: AI in the preview.** Create a key at [OpenRouter](https://openrouter.ai) and paste it into **Preferences** (⌘, on the Mac, Ctrl+, on Windows).

**5. Optional: the AI agent.** In **Preferences → AI agent → Provider**, pick the agent that answers in the panel. Claude Code comes inside the editor; [Antigravity](https://antigravity.google/docs/cli/install/) (`agy`) and [Codex](https://developers.openai.com/codex/cli/) are programs you install on your computer, and the panel shows how to install and sign in to the one you pick. The editor never downloads them for you. The same page holds standing instructions for the agent, its skills and its MCP servers.

> The agent signs in with your own personal account in the chosen service, which works for people using the editor on their own computer. Distributing the app to other people may call for a different kind of authentication, depending on the service; see [docs/distribuicao.md](docs/distribuicao.md) (in Portuguese).

## Project status

The editor is experimental, like the Edukors Graph standard itself, and the course format may still change. It runs on macOS (universal: Apple Silicon and Intel) and on Windows (x64); neither build is signed yet. A Linux version is not built, but the code allows it.

## For developers

The app is built with [Tauri 2](https://tauri.app) (Rust) and React; the AI agent runs in a separate Node process (`agent/`), with one module per provider in `agent/providers/`. The agent architecture, tests, code structure and known limitations are described in [docs/desenvolvimento.md](docs/desenvolvimento.md), and signing, notarization and the Windows installer in [docs/distribuicao.md](docs/distribuicao.md) (both in Portuguese). Tests run with `npm test`, and `npm run update-assets` updates the schema, the player and the map viewer from the [edukors_graph](https://github.com/mgarlabx/edukors_graph) repository.

## License

[MIT](LICENSE.md). Copyright (c) 2026 Edukors.org - Maurício Garcia.
