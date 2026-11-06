# Teacher's guide — Edukors Graph Editor

This guide shows how to build a course in Edukors Graph Editor, from the first step to a file ready to publish. You don't need to write JSON: everything is done on the map and in the inspector.

## 1. The idea in one sentence

A course is a **graph**. Each **node** is a step the student sees or does (a text, a quiz, a form) or an assessment the AI makes behind the scenes. Each **arrow** (edge) says which step comes next, and it can carry a **condition**: "if they scored 70% or more, go here; otherwise, go there".

## 2. Install and open

**On a Mac** (Apple Silicon or Intel, macOS 11 or later):

1. Download [`Edukors-Graph-Editor-mac.dmg`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-mac.dmg), open it and drag the app into the **Applications** folder.
2. Open the app. The first time, macOS asks whether you want to open an app downloaded from the Internet: click **Open**.

**On Windows** (10 or 11, 64-bit):

1. Open the editor's page in the Microsoft Store, [Edukors Graph Editor](https://apps.microsoft.com/detail/9N0N0P3GVRCK), and click **Get** (if the Microsoft Store app opens, click **Get** there too). No warning, no administrator password.
2. The editor stays in the Start menu. New versions come through the Microsoft Store, like those of any other app installed from it.

Without the Microsoft Store (some school computers have it turned off), use the installer instead:

1. Download [`Edukors-Graph-Editor-windows.exe`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-windows.exe). If the browser says the file isn't commonly downloaded, open the **…** menu next to it and choose **Keep** (in Edge, also **Show more → Keep anyway**).
2. Open the downloaded file. This installer has no digital signature, so Windows shows **Windows protected your PC**. Click **More info** and then **Run anyway**.
3. The installer doesn't ask for an administrator password; then the editor opens, and it stays in the Start menu.

If Windows says it **blocked** the installer, with no *Run anyway* button, the computer has **Smart App Control** turned on, or a school policy that only allows signed programs. Install from the Microsoft Store, or talk to whoever looks after the computer.

**On Linux** (64-bit, x64):

- On **Ubuntu, Debian, Mint** and their relatives, download [`Edukors-Graph-Editor-linux.deb`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.deb) and double-click it (or run `sudo apt install ./Edukors-Graph-Editor-linux.deb` in the folder it is in). The installation asks for your password; then the editor is in the applications menu.
- On **other distributions**, download [`Edukors-Graph-Editor-linux.AppImage`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.AppImage), mark it as executable (right-click → **Properties → Permissions → Allow executing file as program**, or `chmod +x` in a terminal) and open it. It runs without installing, from wherever it is.

**New versions.** When a new version comes out, the editor shows a notice, "Version … is available.", with a **Download** button: it opens the download page, and you install the new version the same way you installed the first one. The editor does not update itself. With the Microsoft Store, the Store itself does the updating.

**On every system**, the first time, the editor shows the **Terms of use** (the MIT license, explained): you must click **Accept** to go on (**Decline and quit** closes the editor). They stay available under **Help → Terms of use**. The editor's version shows in the bar at the bottom of the window and at the top of **Help**. From there you can create a **New** course or **Open** a file. To see how a course is put together, download the [sample courses](https://github.com/mgarlabx/edukors_graph/blob/main/samples/samples.README.md) (*Cats of the World*, eight `.egf` files, each one explained) and open them in the editor; they also run, with a short video each, at [edukors.org/graph](https://edukors.org/graph/).

### Course files: `.egrx` and `.egf`

- The editor saves the course in an **`.egrx`** file: a package with the course, the map's arrangement and the conversations with the AI assistant about it. It is the working file.
- An **`.egf`** course (or an older `.json`) also opens in the editor, with **Open**, **Recent** or a double click. It opens as a course **not saved yet**: when you save, the editor asks for a name and a folder for the `.egrx`. **Save** never changes the original `.egf` file.
- The `.egf` is still the file you publish (section 11): to make one, use **Export**.
- Once installed, an `.egrx` or an `.egf` opens in the editor with a double click.

### Coming from version 2.20

The first time this version opens, it brings over from 2.20, just once, what was already there: the editor's settings, the AI assistant's settings and skills, the terms already accepted, the **Recent** files that still exist, the language and the theme. The OpenRouter key does not come along: paste it again in **Settings → Preview AI** (section 9). The 2.20 data stays where it was.

When you open an `.egf`, the conversations 2.20 kept about that file go into the assistant's history for that course.

Version 2.20 cannot open `.egrx` files. To take a course back to it, use **Export → Course (.egf)**.

## 3. The screen

| Part | What it does |
| --- | --- |
| **Top bar** | From left to right: the logo (opens edukors.org); **File** (New, Open, Recent, Save, Export, Show in folder); the **Map / EGF / Preview / Preview with map** views; Undo and Redo; Cut, Copy, Paste, Duplicate and Delete; **Insert node**, **Fit the graph** and **Problems**; **Settings** and **Help**. At the far right, the **Sidebar** button (the inspector) and the **AI assistant** button. |
| **Course tabs** (just below) | One open course per tab; ＋ creates a new course. |
| **Map** (center) | The steps and the arrows. Drag the steps to arrange them, or drag a section's title to move the whole section; ⇧⌘L arranges everything automatically. |
| **Inspector** (sidebar, on the left) | The content of whatever is selected. The title, the type and the id stay fixed at the top; below, the step is split in two parts: *General data* (identification, exits and extras) and the part for its type (the content, the questions, the judgement…). It starts closed; the **Sidebar** button, at the far right of the top bar, opens and closes it. Its edge can be dragged to change its width. With nothing selected, it shows the course's information. |
| **AI assistant** (on the right) | The assistant's panel (section 12). It opens and closes with its own button, independently of the inspector: both can be open together. |

With no course open, the bar shows only New, Open, Recent, Settings and Help.

### Settings and Help

**Settings** (⚙, or ⌘,) has three parts:

- **Interface**: the **Interface language** (the editor's texts; the course's language does not change), the **Theme** (System, Light or Dark) and the **Font size**, from 80% to 200% (also with ⇧⌘+ and ⇧⌘−). In Chinese and Hindi, the editor's own texts and this guide show in English.
- **AI assistant**: the assistant's accounts and options (section 12).
- **Preview AI**: the OpenRouter key and the Preview's models (section 9).

**Help** has three tabs: **Quick guide**, **Full guide** (this guide) and **Terms of use**.

### Several courses at once

Every course you open or create gets a **course tab**, just below the top bar. Click a tab to switch courses: each one keeps its own undo, selection, map position and Preview. The tab shows when there are unsaved changes; the ✕ closes the tab and, if there is something to save, the editor asks first. Opening a file that is already open just shows its tab.

If the editor closes suddenly with unsaved changes, the next time it opens it offers to **Recover** or **Discard** those courses. A recovered course opens as "… (recovered)", not saved yet; the original file is not touched.

To **bring steps from one course to another**: select the steps on the map, press ⌘C, switch tabs, click the map and press ⌘V. The steps arrive with new ids, near the center of the screen and in the same arrangement; the arrows between them come along. References from one to another now point to the copies: a copied *Score (AI)* together with its form assesses the copied form. The texts arrive in the destination course's languages; if its main language is missing, the original text goes into that language, for you to translate right there.

You can also paste onto the map a step copied from the **EGF** tab (the whole step object, from `{` to `}`).

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

1. **New course.** Click **New** on the top bar (or the ＋ next to the course tabs). With nothing selected, fill in the title, the author and, if you like, the description in the inspector.
2. **Add steps.** Click **Insert node** on the top bar and choose *Text*: the new step appears below the selected one and comes already selected. Write the title in the inspector. The content shows there read-only: click ✎ (or the text itself) to open it in the content editor.
3. **Connect the steps.** Drag from the circle at the bottom of a step to another one. That creates an arrow.
4. **Mark the start.** The course's first step has the ▶ badge. To change it, tick "This is the course's start node" on the step you want.
5. **Save** with ⌘S (or **Save**). The first time, the editor asks for the name and the folder; it writes a single file, `my-course.egrx`, with the course, the map's arrangement and the conversations with the assistant. **Save as** (⇧⌘S) writes a copy under another name. Moving a step on the map is also a change: the course tab shows there is something to save until you save it.

### The content editor

The content of a *Text* (markdown) or *HTML* step, and the prompt of an *AI text* or *AI HTML* step, are not edited in the inspector: there they are shown read-only, and the ✎ next to the field's name (or a click on the text) opens the editor, which fills the work area, between the inspector and the AI assistant.

- **Raw** shows the text as it is written; **View**, as the student sees it.
- The bar has the main commands: heading, bold, italic, bulleted list, numbered list, link and image (in HTML, paragraph too). They act on the selected passage; ⌘B, ⌘I and ⌘K apply bold, italic and link.
- A prompt is written in markdown, with the same bar plus the **Insert {{STORAGE: …}}** list; typing `{{` opens the list of keys right at the cursor.
- The icon at the right end of the bar turns the wrapping of long lines on and off.
- In a course with several languages, the selector at the top switches the text's language.
- The ✦ at the top opens and closes the **AI assistant** beside the text. It knows which text you have open and in which language: ask it to "make this shorter", "add an example here", "translate this into Spanish", and what it writes appears in the box (⌘Z undoes).
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

The **Problems** button on the top bar (or ⇧⌘M) opens and closes the problems panel, below the map, with the course's errors and warnings; click an item to go to the step or the arrow. Steps with a problem also get a red or orange badge on the map.

- **Errors** keep the course from working (an arrow to a step that doesn't exist, a quiz without a correct answer).
- **Warnings** are advice (a very short text, a missing translation). The course works, but they are worth reading.

The editor applies the same rules the player uses to check a course before importing it.

## 9. Testing as the student (Preview)

In the **Preview** view you take the course as the student would, with the real AI.

1. In **Settings → Preview AI**, paste your **OpenRouter key** and click **Store key**. It is kept encrypted by the system itself and is never shown to the editor's page; **Delete** removes it. The same section holds the **Generation** and **Judgement** models, with the same values as the player.
2. The AI texts are generated on the spot; the AI's grades and choices are made as on the server, with the same model and the same limits.
3. Next to **Start over**, **Showing** gives the id of the step on screen, also when the student reviews an earlier step. Click it to go to that step on the map; the preview carries on from where it was.
4. The button at the right end of the preview's bar opens and closes the **Calls, state, path and console** panel (it starts closed):
   - **Calls**: every call to the AI, with model, tokens, cost and time. Click one to see what was sent and the answer.
   - **State**: everything the student has produced so far.
   - **Path**: each step, the arrow taken and the condition that decided it; the path also shows in green on the map. Use **Back to node** to test another branch without redoing everything.
   - **Console**: what the course writes to the browser's console and the errors it leaves unhandled, including those of an HTML page, each line with the time and the step it came from. Use it to understand why a simulation doesn't work.
5. If you edit the course with the preview open, click **Apply changes** to reload while keeping the student where they are.
6. The links in a step open in your computer's browser, and the preview stays where it was.
7. The **Preview with map** view (⇧⌘P) is the same preview with the course map beside it, as the student sees it on the platform: the map marks the steps already done and the path taken, and follows the current step. The arrows on the line between the two halves widen one of them. Switching between the two views does not restart the student.

Without a key, the preview runs in a reduced mode: the AI texts show "try again" and the AI's assessments become a panel where you pick the result yourself.

To test a single assessment, use **Test judgement** in the inspector of the Score/Choice/Probability: type a sample text and see what the AI answers, the keys that would be saved and where the student would go.

## 10. Several languages

- **Course languages…** (in the course's inspector): add languages (`pt`, `en`, `es`, `pt-BR`…). The source language is always the first one.
- The inspector shows and edits all the texts in a single language, chosen in the **Language of the texts** bar, just below the step's title. It is also the language of the titles on the map: changing one changes the other. An orange dot marks the language in which some text of the step is still empty, and each field shows, next to its name, the tag of the language it is showing.
- In the Preview, the student's language is chosen in the player itself.

## 11. Publishing

Use **Export**, on the top bar. The export screen offers two formats:

- **Course (.egf)**: the course as it is, for the player, the Moodle plugin and the gallery.
- **Player (HTML)**: one HTML file that runs the course on its own, with no server (the AI's assessments become the manual panel).

The file is written next to the `.egrx`, with the same name (for example, `my-course.egf`). A course that has no file yet is saved first. If a file with that name already exists, the editor tells you, and it is replaced only after **Replace**. Exporting never changes the `.egrx`.

- To publish on Edukors, export the **Course (.egf)**, upload the file `my-course.egf` to your Google Drive and register it in the "Gallery" section.
- If you prefer, upload the file to the provider of your choice.

## 12. The AI assistant

The **AI assistant** button, at the far right of the top bar, opens the assistant's panel at the right end of the window, beside the map; click it again (or the panel's ✕) to close it. The assistant works on the conversation's course: it reads the steps, writes, connects arrows, translates, validates, fixes and arranges the map. With the content editor open, its own ✦ brings the assistant beside the text, to work on that text (section 5).

**Before you start.** The assistant answers with an account of yours in **Claude Code** (Anthropic) or **Codex** (OpenAI), programs you install on your computer. In **Settings → AI assistant**:

1. Under **Accounts**, click ＋ (**Add account**), choose the **AI service** (each one shows whether its program is installed), give it an **Account name** and click **Add and sign in**. Signing in happens on the service's page, in the browser. If the program is not installed, the screen shows the **Official guide** and the install command for your system (**Copy command**); once it is installed, click **Check again**. The editor installs nothing by itself.
2. Tick, on the left of the account, the one the editor will use. Accounts apply to every EDUKORS app on the computer; changing the account starts a new conversation.

Below the accounts, these apply to this editor only:

- **Instructions**: a text the assistant reads in every new conversation. Use it for what always applies: the audience ("my students are in 9th grade"), the tone ("informal, short sentences"), building habits ("end each section with a 3-question quiz").
- **MCP servers**: connect the assistant to other services. The ＋ asks for the server's **Name** and **Address (URL)**. Servers that ask you to log in on the web don't work here.
- **Skills**: packages of instructions (a folder with a `SKILL.md` file) that teach the assistant to do a task in a certain way. The ＋ adds a skill from a ZIP file; the trash icon deletes it.

**How to ask.** Write in the field at the bottom and send. Examples:

- "Review the course and fix the validation errors."
- "Create a 3-question quiz about the selected step."
- "Build a writing task assessed by the AI after sm3, with feedback."
- "Translate the missing texts into Spanish."
- "Create a short course on fractions for 6th grade." (it creates the course in a new tab)

Every request carries the state of the course on screen, unsaved changes included, and whatever is selected on the map. That is why "this step" means the selected step.

**The field's ＋** offers: **Add files** (attach files to the request), **Skills** and **MCP servers** (to ask it to use one of them for this request) and **Search the web** (on or off).

**The three modes** (on the mode button, next to the model):

| Mode | What happens |
| --- | --- |
| **Review before applying** | The default. Each change to the course waits in a card, with **Details**; click **Approve** or **Decline**. |
| **Apply changes** | The assistant changes the course at once. |
| **Plan** | The assistant reads the course and proposes a plan, without changing anything. To carry out the plan, choose another mode and ask. |

In any mode, **each change the assistant makes is one undo step**: ⌘Z undoes the last one. When it wants to use one of your MCP servers, it asks first: **Allow**, **Always allow** (in this conversation) or **Decline**. The assistant does not save the course file: save it yourself, with ⌘S, when you are happy.

**The assistant's questions.** When the request could go more than one way (the school year, the length, the languages), the assistant asks in a card with options; pick one or write another answer.

**Model and effort.** On the model button, next to send, you choose among the models the service offers and, when the model allows it, the **effort**: more effort, more careful and slower answers. The choice is kept for each account.

**Account usage.** Below the field, a bar shows how much of your account's usage window (**Session limit**) has been used and when it resets. It is your account's usage in the service, not the editor's.

**Conversations.** Conversations belong to the course: they are kept inside the `.egrx` when you save (so a new conversation also counts as an unsaved change). At the top of the panel, **Conversations** opens the course's history, by day, with search; click one to carry on. **New conversation** starts another one; the trash icon deletes a conversation.

**Stopping.** While the assistant works, the send button turns into **Stop**. Changes already made stay and can be undone.

## 13. Shortcuts

On Windows and Linux, ⌘ and ⌃ stand for Ctrl, ⌥ for Alt and ⇧ for Shift.

| Shortcut | Action |
| --- | --- |
| ⌘S / ⇧⌘S | Save / save as |
| ⌘W | Close the course tab |
| ⌃⇥ / ⌃⇧⇥ | Next course tab / previous |
| ⌘Z / ⇧⌘Z | Undo / redo |
| ⌫ | Delete whatever is selected on the map |
| ⌘D | Duplicate the selected steps |
| ⌘X / ⌘C / ⌘V | Cut, copy and paste steps (from one course tab to another too) |
| ⌘A | Select all steps |
| ⌘0 | Fit the graph |
| ⇧⌘L | Auto layout |
| ⇧⌘M | Open / close the problems panel |
| ⌘M / ⌘E / ⌘P | Map / EGF / Preview view |
| ⇧⌘P | Preview with map view |
| ⌘, | Settings |
| ⇧⌘+ / ⇧⌘− | Increase / decrease the font size |
| ⌘B / ⌘I / ⌘K | Bold / italic / link, in the content editor |
| Esc | Clear the selection |
