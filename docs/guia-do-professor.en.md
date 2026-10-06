# Teacher's guide — Edukors Graph Editor

This guide shows how to build a course in Edukors Graph Editor, from the first step to a file ready to publish. You don't need to write JSON: everything is done on the graph and in the panel on the right.

## 1. The idea in one sentence

A course is a **graph**. Each **node** is a step the student sees or does (a text, a quiz, a form) or an assessment the AI makes behind the scenes. Each **arrow** (edge) says which step comes next, and it can carry a **condition**: "if they scored 70% or more, go here; otherwise, go there".

## 2. Install and open

1. Open the file `Edukors Graph Editor.dmg` and drag the app into the **Applications** folder.
2. The first time, if macOS warns that the app could not be verified, right-click the app and choose **Open**. Then the editor shows the **Terms of use** (the MIT license, explained): you must accept them to go on. They stay available under **Help → Terms of use**. Each time it opens, the editor shows its version, which also appears at the top of **Help**.
3. On the start screen you can create a **New course**, **Open** an `.egf` file or open one of the **Samples** (*World Cats*), which are a great way to see how a course is put together.

Tip: once installed, an `.egf` course opens in the editor with a double click. An older `.json` course becomes `.egf` by changing the file's extension (the content is the same).

## 3. The screen

| Part | What it does |
| --- | --- |
| **Graph** (center) | The steps and the arrows. Drag the steps to arrange them, or drag a section's title to move the whole section; use ⊞ to arrange everything automatically. |
| **Inspector** (right) | The content of whatever is selected. It starts closed when you open a file and opens when you click a step or an arrow; the sidebar icon (⌥⌘0) opens and closes it, and its left edge can be dragged to change its width — in the Preview, the same icon opens and closes the panel with the calls, state, path and console. With nothing selected, it shows the course's information. It stays open when the AI agent appears beside it. |
| **Top bar** | Save, the ＋ that **inserts** steps (the ten types, also in the **Insert** menu), undo, the **Map / JSON / Preview** tabs, the graph's language, the **problems** badge and, at the far right, the **AI agent** ✦. |
| **Course tabs** (just below) | One open course per tab; ＋ creates a new course. |

### Several courses at once

Every course you open or create gets a **course tab**, just below the top bar. Click a tab to switch courses: each one keeps its own undo, selection, graph position and Preview. The ● dot on a tab means unsaved changes; the ✕ closes the tab and, if there is something to save, the editor asks first. Opening a file that is already open just shows its tab. To reorder, drag the tabs.

To **bring steps from one course to another**: select the steps on the graph, press ⌘C, switch tabs, click the graph and press ⌘V. The steps arrive with new ids, near the center of the screen and in the same arrangement; the arrows between them come along. References from one to another now point to the copies: a copied *Score (AI)* together with its form assesses the copied form. The texts arrive in the destination course's languages; if its main language is missing, the original text goes into that language, for you to translate right there.

You can also paste onto the graph a step copied from the **JSON** tab (the whole step object, from `{` to `}`).

## 4. The step types

**What the student sees**

| Type | What for |
| --- | --- |
| Text | A lesson written in markdown (headings, lists, bold, images, formulas). |
| HTML | A ready-made interactive page (simulations, charts). |
| AI text | The AI writes the text on the spot, for that student (for example, a review of what they got wrong). |
| AI HTML | The AI builds a page for that student. |
| Quiz | Multiple-choice questions, each with one correct option. |
| Form | Fields for the student to fill in; with instructions and a long text field it becomes a **writing task**. |
| Yes/no | A yes-or-no question, which usually opens a longer or a shorter path. |

**What the AI decides, without the student stopping** (shown as diamonds)

| Type | What for |
| --- | --- |
| Choice (AI) | The AI picks one option from a list you wrote (for example: "review", "normal", "advanced"). |
| Score (AI) | The AI places the student's work on a scale of levels you wrote; with points, it becomes a grade from 0 to 100. |
| Probability (AI) | The AI answers a yes-or-no question with the probability of yes. |

## 5. Building a course, step by step

1. **New course.** Click ＋ next to the course tabs (or press ⌘N). With nothing selected, fill in the title, the author and, if you like, the description on the right.
2. **Add steps.** Click the ＋ on the top bar (or open the **Insert** menu) and choose *Text*: the new step appears below the selected one and comes already selected. To choose where it goes, drag *Text* from the ＋ list onto the graph. Write the title in the inspector. The content shows there read-only: click ✎ (or the text itself) to open it in the full-screen editor.
3. **Connect the steps.** Drag from the circle at the bottom of a step to another one. That creates an arrow.
4. **Mark the start.** The course's first step has the ▶ badge. To change it, tick "This is the course's start node" on the step you want.
5. **Save** with ⌘S. The editor writes a single file, `my-course.egf`, with the course and the graph's arrangement. Moving a step on the graph is also a change: the course tab shows a dot until it is saved.

### The content editor

The content of a *Text* (markdown) or *HTML* step, and the prompt of an *AI text* or *AI HTML* step, are not edited in the inspector: there they are shown read-only, and the ✎ next to the field's name (or a click on the text) opens the editor, which fills the whole window.

- **Raw** shows the text as it is written; **View**, as the student sees it.
- The bar has the main commands: heading, bold, italic, bulleted list, numbered list, link and image (in HTML, paragraph too). They act on the selected passage; ⌘B, ⌘I and ⌘K apply bold, italic and link.
- A prompt is written in markdown, with the same bar plus the **Insert {{STORAGE: …}}** list; typing `{{` opens the list of keys right at the cursor.
- The icon at the right end of the bar turns the wrapping of long lines on and off.
- In a course with several languages, the selector at the top switches the text's language.
- What you type goes into the course right away: **Done** (or Esc) closes the editor without losing anything, and ⌘Z undoes.

## 6. Different paths for different students

When a step has more than one arrow leaving it, the student follows **the first one whose condition holds**. The arrows are numbered in that order.

1. Click an arrow to see the **condition editor**.
2. Choose the **key** (what the student produced, such as `q1.percent`, the percentage of correct answers on quiz `q1`), the **operator** (≥, <, =…) and the **value**. The editor shows each key's scale (0–100, 0–1, yes/no…).
3. Join conditions with **AND** (all hold) or **OR** (at least one holds).
4. Whenever there are conditions, leave **one arrow without a condition last**: it is the "otherwise". A new arrow created after it goes in before it, with a condition for you to adjust.
5. To change the order, use ↑ ↓ in the "Edges leaving this node" list.

**Things the editor reminds you about:**

- After an AI step (diamond), there must always be an arrow without a condition: if the AI cannot judge, the student leaves through it.
- The grade of a *Score (AI)* step goes from 0 to the number of levels minus one (for example, from 0 to 2) and is not a whole number. To compare with a grade from 0 to 100, give the levels **points** and use `s1.percent`.
- Avoid "equal to" on numbers the AI produces; use ≥ or <.

## 7. A writing task assessed by the AI

The pattern is **Form → Score (AI) → AI text**:

1. **Form** with *instructions* (the prompt: what to write, how many words, what will be assessed) and a *Long text* field, with a minimum and a maximum number of words.
2. **Score (AI)**. In the **state**, write the task and insert the student's text with `{{STORAGE: f1.text}}` (type `{{` and choose the key from the list). In each **question**, say what to assess and what to ignore ("Assess the evidence. Do not assess spelling."), and describe the levels from weakest to strongest.
3. **AI text** with **"Written from the judgement"** pointing to the Score. The prompt only says *how* to write the comment (tone, length, what to praise); the grade is already decided.
4. Arrows: Score → comment with the condition `s1.percent ≥ 0` (meaning "there was a judgement"), and Score → next step without a condition.

The Score's inspector shows the form's instructions next to the state and warns you if you changed one and forgot the other.

## 8. Finding and fixing problems

The badge on the top bar shows ✖ errors and ⚠ warnings. Click it to see the list; click an item to go to the step or the arrow. Steps with a problem also get a red or orange badge on the graph.

- **Errors** keep the course from working (an arrow to a step that doesn't exist, a quiz without a correct answer).
- **Warnings** are advice (a very short text, a missing translation). The course works, but they are worth reading.

The editor applies exactly the same rules as the builder's validator (`validate_course.py`).

## 9. Testing as the student (Preview)

In the **Preview** tab you take the course as the student would, with the real AI.

1. In **Preferences** (⚙), paste your **OpenRouter** key. It is kept in the Mac's Keychain, never in a file.
2. The AI texts are generated on the spot; the AI's grades and choices are made as on the server, with the same model and the same limits.
3. Next to **Start over**, **Showing** gives the id of the step on screen, also when the student reviews an earlier step. Click it to go to that step on the graph; the preview carries on from where it was.
4. On the right:
   - **Calls**: every call to the AI, with model, tokens, cost and time. Click one to see what was sent and the answer.
   - **State**: everything the student has produced so far.
   - **Path**: each step, the arrow taken and the condition that decided it; the path also shows in green on the graph. Use **Back to node** to test another branch without redoing everything.
   - **Console**: what the course writes to the browser's console and the errors it leaves unhandled, including those of an HTML page, each line with the time and the step it came from. Use it to understand why a simulation doesn't work.
5. If you edit the course with the preview open, click **Apply changes** to reload while keeping the student where they are.
6. The links in a step open in your computer's browser, and the preview stays where it was.

Without a key, the preview runs in a reduced mode: the AI texts show "try again" and the AI's assessments become a panel where you pick the result yourself.

To test a single assessment, use **Test judgement** in the inspector of the Score/Choice/Probability: type a sample text and see what the AI answers, the keys that would be saved and where the student would go.

## 10. Several languages

- **Course languages…** (in the course's inspector): add languages (`pt`, `en`, `es`, `pt-BR`…). The source language is always the first one.
- Each text gets one tab per language; the empty ones show an orange dot.
- The 🌐 selector on the bar changes the language of the titles on the graph; in the Preview you choose the student's language.

## 11. Publishing

- **File → Export course…** produces an HTML file that runs the course on its own, with no server (the AI's assessments become the manual panel).
- To publish on Edukors, upload the file `my-course.egf` to your Google Drive and register it in the "Gallery" section.
- If you prefer, upload the file to the provider of your choice.

## 12. The AI agent

The ✦ icon at the far right of the top bar (or ⇧⌘A) opens the **AI agent** at the right end of the window, beside the graph and the inspector; click it again to close it. The two panels are independent: the sidebar icon (⌥⌘0) opens and closes only the inspector, and ✦ only the agent. The editor is set up to work with the Claude Code installed on your computer. The agent works on the course on screen: it reads the steps, writes, connects arrows, translates, validates and fixes.

**Before you start:** the agent uses your Claude account, the same one as Claude Code. If the panel says no account is connected, open Terminal, type `claude` and, inside it, `/login`; then click **Try again**.

**How to ask.** Write in the field at the bottom and press ↵ (⇧↵ starts a new line). Examples:

- "Review the course and fix the validation errors."
- "Create a 3-question quiz about the selected step."
- "Build a writing task assessed by the AI after sm3, with feedback."
- "Translate the missing texts into Spanish."
- "Create a short course on fractions for 6th grade." (with no course open, it creates one in a new tab)

Whatever is selected on the graph goes along with the message: it shows in the ◎ chip in the field (click it to leave it out). That is why "this step" means the selected step.

**Standing instructions.** In **Preferences → AI agent** there is a text field the agent reads at the start of every session. Use it for what always applies: the audience ("my students are in 9th grade"), the tone ("informal, short sentences"), building habits ("end each section with a 3-question quiz"). What you ask in the conversation takes priority. The instructions apply from the next session on (**New session**).

**Skills and MCP servers.** Also in **Preferences → AI agent** you can give the agent extra abilities:

- **Skills** are packages of instructions (a folder with a `SKILL.md` file, sometimes with scripts) that teach the agent to do a task in a certain way. Click **Open skills folder**, put the skill's folder there and click **Reload**: it shows up in the list.
- **MCP servers** connect the agent to other programs and services (a folder of materials, a document base…). Paste into the **MCP servers** field the JSON the server's documentation gives for Claude Code (the `.mcp.json`). Servers that ask you to log in on the web don't work here.

Both apply from the next session on (**New session**). The model menu, at the foot of the panel, shows the loaded skills and whether each server connected (✓) or failed (✗). If a skill needs to run a command on the Mac, the agent asks for your approval **for every command**, showing the command, even in Auto mode.

**The three modes** (on the ✋ button in the field):

| Mode | What happens |
| --- | --- |
| **Ask first** | Each change shows up in a card with what will change (steps added, changed, deleted, arrows). Click **Allow**, **Always allow in this session** or **Decline** (the **…** lets you say what it should do instead). |
| **Auto edit** | The agent changes the course without asking. |
| **Plan** | The agent studies the course and writes a plan, without changing anything. Approve the plan for it to carry out, or ask for changes. |

In any mode, **each change the agent makes is one undo step**: ⌘Z undoes the last one. Reading a file from your Mac (attached with the 📎 clip) or opening a web page always asks for your permission. The agent does not save the course file: save it yourself, with ⌘S, when you are happy.

**The agent's questions.** When the request could go more than one way (the school year, the length, the languages), the agent asks in a card with options; pick one or write another answer.

**Model and effort.** On the model button (for example, *Opus 5.5*) you choose Claude's model and the **effort**: more effort, more careful and slower answers. The default works for almost everything.

**Account and usage.** The same menu shows the Claude account in use and the **account usage**: the subscription's limit windows, as Claude Code reports them, each with a bar. *Current session* is the 5-hour window; *Current week*, the weekly one; each line says when the window resets. Usage is updated when the panel opens and after each answer (⟳ updates it right away), and it also shows at the start of each new conversation. The windows belong to the account, not to the editor: they also count what you use on claude.ai and in Claude Code. To use another account, log in with it in Claude Code (`claude`, then `/login`) and start a new conversation in the panel.

**Sessions.** Each conversation is kept. The title at the top of the panel opens the list of past conversations (with search); click one to carry on from where it stopped. The ✎ icon starts a new conversation; each item's 🗑 deletes the conversation.

**Stopping.** While the agent works, the send button turns into ■: click it (or press Esc in the field) to interrupt. You can also write while it works: the message goes into the queue.

## 13. Shortcuts

On Windows, ⌘ and ⌃ stand for Ctrl, ⌥ for Alt and ⇧ for Shift; inside the editor, each shortcut already shows the keys of your system.

| Shortcut | Action |
| --- | --- |
| ⌘N / ⌘O / ⌘S / ⇧⌘S | New, open, save, save as |
| ⌘W | Close the course tab |
| ⌃⇥ / ⌃⇧⇥ | Next course tab / previous |
| ⌘1 … ⌘9 | Go to course tab 1 … 9 (⌘9: the last one) |
| ⌘Z / ⇧⌘Z | Undo / redo |
| ⌫ | Delete whatever is selected on the graph |
| ⌘D | Duplicate the selected steps |
| ⌘C / ⌘V | Copy and paste steps (from one course tab to another too) |
| ⌘A | Select all steps |
| ⌘0 | Fit the graph |
| ⇧⌘L | Arrange automatically |
| ⇧⌘M | Open / close the problems panel |
| ⌘M / ⌘J / ⌘P | Map / JSON / Preview tab |
| ⌥⌘0 | Open / close the inspector (in the Preview, the side panel) |
| ⌘, | Preferences |
| ⇧⌘A | Open / close the AI agent |
| ⌘B / ⌘I / ⌘K | Bold / italic / link, in the content editor |
| Esc | Clear the selection |
