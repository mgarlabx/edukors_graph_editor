# Edukors Graph Editor

Edukors Graph Editor is a visual *builder* that runs on your computer, for creating and editing adaptive courses in the [Edukors Graph](https://github.com/mgarlabx/edukors_graph) format.

> At the moment, only a Mac version is available. However, this code can be freely downloaded and modified to produce Windows and Linux versions.

## Part of the Edukors Graph project

[Edukors Graph](https://github.com/mgarlabx/edukors_graph) is an open standard for adaptive courses, linked to the [Edukors.org](https://edukors.org) project. The idea is an old one in education: give each student what they need, taking into account what they already know. To do this, the course is described as a graph. The **nodes** are what the student sees: a text, a video, a quiz, a writing task assessed by AI. The **edges** say where they go next, based on what they have done so far. Students who pass the quiz move on; those who don't receive a different explanation before trying again.

The entire course fits in a single JSON file, and the project is made up of a few pieces built around that file:

- the **schema**, which defines the course format;
- the **builder**, which generates courses from a short description, with the help of an AI assistant;
- the **player**, a server that delivers courses to students, including inside a learning management system (via LTI 1.3);

This editor is another *builder*, designed to run locally. In the repository's builder, you talk to an AI and receive the finished course. Here, you see the course as a map and build or adjust it with your own hands, with an AI alongside if you wish. The result is the same JSON file, which the player opens without any conversion.

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

**The JSON.** If you prefer, you can edit the file directly in its own tab, which stays in sync with the map.

**The preview.** You take the course as a student, using the project's own player. AI activities (generated texts and assessments) work for real when you provide an [OpenRouter](https://openrouter.ai) key, which is stored in the Mac Keychain. Without the key, the preview runs in a reduced mode, and you choose the assessment results yourself.

**Tabs.** Several courses can be open at the same time, and you can copy activities from one to another.

**The AI agent.** A panel on the right provides an agent, built with Claude, that reads the open course and changes it on request. By default, each change waits for your approval, and everything can be undone.

Each course is saved in a single file, `course.egf` (Edukors Graph Format: the course's JSON under its own extension, which the app is associated with), which is also what goes to the player. Older `.json` courses still open; their first save asks where to write the `.egf`. The position of each box on the map is saved in it too, in the node's `position` field, which players ignore.

The [teacher's guide](docs/guia-do-professor.md) (in Portuguese) explains how to use the editor step by step.

## Installation

The editor runs on macOS 11 or later. For now it is installed from source, which requires a few tools, all of them free. The commands below are typed in Terminal.

**1. Install the tools.**

- Apple command line tools: `xcode-select --install`
- [Rust](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [Node.js](https://nodejs.org), version 22 or later

**2. Download the project and install the dependencies.**

```sh
git clone https://github.com/<account>/edukors-graph-editor.git
cd edukors-graph-editor
npm install
```

**3. Open the editor.**

```sh
npm run app:dev
```

The first time takes a few minutes, because the app is compiled. After that it is fast.

If you prefer an app to keep in your Applications folder, build it with `npm run app:build`. The `.app` and `.dmg` are placed in `src-tauri/target/release/bundle/`. Since the app is not yet signed by Apple, open it the first time with right-click → **Open**.

**4. Optional: AI in the preview.** Create a key at [OpenRouter](https://openrouter.ai) and paste it into **Preferences** (⌘,).

**5. Optional: the AI agent.** The agent uses [Claude Code](https://code.claude.com) installed and logged in on this Mac. Install it, run `claude` in Terminal and sign in to your account with `/login`.

> The agent uses your personal Claude Code login, which works for people using the editor on their own Mac. To distribute the app to other people, Anthropic requires API key authentication; see [docs/distribuicao.md](docs/distribuicao.md) (in Portuguese).

## Project status

The editor is experimental, like the Edukors Graph standard itself, and the course format may still change. For now, it runs only on macOS.

## For developers

The agent architecture, tests, code structure and known limitations are described in [docs/desenvolvimento.md](docs/desenvolvimento.md) (in Portuguese). Tests run with `npm test`, and `npm run update-assets` updates the schema, the player and the samples from the [edukors_graph](https://github.com/mgarlabx/edukors_graph) repository.

## License

[MIT](LICENSE.md). Copyright (c) 2026 Edukors.org - Maurício Garcia.
