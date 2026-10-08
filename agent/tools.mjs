// @ts-check
/**
 * The tools the agent works on the course with, declared once for every
 * provider.
 *
 * They are run in the editor: each call goes to the webview
 * (src/agent/editorTools.ts), which reads or changes the course through the
 * same store as the canvas and the inspector, so every change is validated and
 * can be undone with ⌘Z.
 *
 * How they reach the model depends on the provider: Claude Code is given them
 * in its own process (providers/claude.mjs builds an SDK server from this
 * list), and the others reach them over a local MCP server (mcpBridge.mjs).
 * Whoever asks, the names on the wire are the same, `mcp__edukors__<tool>`.
 */
import { z } from "zod";

export const SERVER = "edukors";

/** The name a tool is called by, from outside: `mcp__edukors__read_course`. */
export const qualified = (/** @type {string} */ name) => `mcp__${SERVER}__${name}`;

const NODE_TYPES = /** @type {const} */ (["static-md", "static-html", "dynamic-md", "dynamic-html", "quiz", "form", "bool", "choice", "score", "noul"]);

const loc = z
  .array(z.object({ lang: z.string(), text: z.string() }))
  .describe("Localized text: one { lang, text } per course language, the source language first.");

const condition = z
  .record(z.string(), z.unknown())
  .describe("A condition: { key, operator, value }, { and: [conditions] } or { or: [conditions] }.");

const content = z.record(z.string(), z.unknown()).describe("The node's content. Its fields depend on the type: see get_schema.");

const operation = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_node"),
    node: z.object({
      id: z
        .string()
        .optional()
        .describe("The type's prefix and the next free number (q3). Give it when another operation in this call refers to the node; left out, the next free id is used."),
      type: z.enum(NODE_TYPES),
      section: z.number().int().optional(),
      title: loc,
      content,
    }),
    near: z.string().optional().describe("An existing node to place the new one beside on the canvas, usually the one it follows."),
  }),
  z.object({
    op: z.literal("update_node"),
    id: z.string(),
    title: loc.optional().describe("Replaces the title."),
    content: content.optional().describe("Replaces the whole content: send every field, changed or not."),
    section: z.number().int().nullable().optional().describe("Moves the node to a section; null takes it out of any."),
  }),
  z.object({
    op: z.literal("delete_node"),
    id: z.string().describe("The node's edges go with it. If it was the start, the first remaining step becomes the start."),
  }),
  z.object({
    op: z.literal("rename_node"),
    id: z.string(),
    new_id: z.string().describe("Same type prefix. Edges, start, from, conditions and {{STORAGE}} references follow the new id."),
  }),
  z.object({
    op: z.literal("set_edges"),
    from: z.string(),
    edges: z
      .array(z.object({ to: z.string(), when: condition.optional() }))
      .describe("Every edge leaving the node, in the order they are tried, the fallback (no when) last. Replaces the node's edges; [] removes them."),
  }),
  z.object({
    op: z.literal("update_info"),
    info: z
      .record(z.string(), z.unknown())
      .describe("Fields of info to set, each replacing the field (title, description, author, version, date, start, sections, other-languages, system-prompt…). null removes an optional field."),
  }),
]);
/**
 * @typedef {"read" | "view" | "edit" | "ask" | "plan"} ToolKind
 * @typedef {{
 *   name: string;
 *   kind: ToolKind;
 *   description: string;
 *   schema: import("zod").ZodRawShape;
 *   annotations: Record<string, boolean>;
 *   providerOnly?: boolean;
 * }} ToolSpec
 */

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const CHANGES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

/** @type {ToolSpec[]} */
export const TOOLS = [
  {
    name: "get_editor_state",
    kind: "read",
    description:
      "What is open in the editor now: the course on screen (title, file, languages, size, problems, unsaved changes), the other courses open in tabs, what is selected on the canvas and which view (Graph, EGF or Preview) is showing. Each message already brings this; call it when you need it fresh in the middle of a task.",
    schema: {},
    annotations: READ_ONLY,
  },
  {
    name: "read_course",
    kind: "read",
    description:
      "Reads the course this conversation works on (the one on screen when the person wrote). Without arguments: an outline with the course info, every node (id, type, section, title), every edge in order with its index, and the keys the nodes produce for conditions and {{STORAGE}}. With `nodes`: the full JSON of those nodes and the edges into and out of them. With `full: true`: the whole course JSON, which is long for big courses — prefer the outline and the nodes you need.",
    schema: {
      nodes: z.array(z.string()).optional().describe("Ids of the nodes to read in full."),
      full: z.boolean().optional().describe("The whole course JSON."),
    },
    annotations: READ_ONLY,
  },
  {
    name: "validate_course",
    kind: "read",
    description:
      "Validates the course with the editor's checks — the rules the player applies before importing a course, plus the JSON schema — and lists every error and warning with where it is. Errors stop the course from working; warnings are advice.",
    schema: {},
    annotations: READ_ONLY,
  },
  {
    name: "get_schema",
    kind: "read",
    description:
      'The Edukors Graph JSON schema, which documents every field with its rules and advice. Without arguments: the list of its definitions. With `definition` (courseInfo, node, quizContent, quizQuestion, formField, boolContent, dynamicMdContent, judgeState, choiceQuestion, scoreQuestion, noulQuestion, edge, comparison…): that definition. With `definition: "all"`: the whole schema, which is long.',
    schema: { definition: z.string().optional() },
    annotations: READ_ONLY,
  },
  {
    name: "edit_course",
    kind: "edit",
    description:
      "Changes the course with a list of operations applied together, as one step the person can undo with ⌘Z. If any operation cannot be applied (an unknown id, an id already taken, a wrong prefix), nothing changes and the error says which. Returns what changed and the validation of the result.",
    schema: {
      summary: z.string().describe("One short sentence, in the person's language, saying what the change does. The person reads it when approving."),
      operations: z.array(operation).min(1),
    },
    annotations: CHANGES,
  },
  {
    name: "replace_course",
    kind: "edit",
    description:
      "Replaces the whole course with a new JSON object { $schema, info, nodes, edges }: for writing a course from scratch or restructuring all of it. Keep info.course-id. For changes to part of a course use edit_course. Undoable with ⌘Z.",
    schema: {
      summary: z.string().describe("One short sentence, in the person's language, saying what the new course is."),
      course: z.record(z.string(), z.unknown()),
    },
    annotations: CHANGES,
  },
  {
    name: "new_course",
    kind: "edit",
    description:
      "Opens a new, blank course in a new tab (one static-md step, sm1) and makes it the course this conversation works on. Use it when the person asks for a new course rather than changes to the one on screen, then write it with edit_course or replace_course.",
    schema: {
      title: z.string(),
      language: z.string().describe("The source language: an ISO 639-1 code, optionally with a region (pt, en, pt-BR)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "show_node",
    kind: "view",
    description: "Selects a node and centers the canvas on it, in the Graph view, so the person sees it.",
    schema: { id: z.string() },
    annotations: READ_ONLY,
  },
  {
    name: "auto_layout",
    kind: "view",
    description: "Arranges the nodes on the canvas automatically, as the editor's layout button does. Use it after adding several nodes or restructuring the graph.",
    schema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  // Claude Code has tools of its own for these two (AskUserQuestion,
  // ExitPlanMode); the other providers are given them here, so that the panel
  // shows the same cards whoever is answering.
  {
    name: "ask_user",
    kind: "ask",
    providerOnly: true,
    description:
      "Asks the person a question and waits for the answer, with options to pick from (they can also write their own). Use it when a request is ambiguous in a way that changes the result (audience, length, number of steps, languages), before writing. Do not use it for what you can read with the other tools.",
    schema: {
      questions: z
        .array(
          z.object({
            question: z.string().describe("The question, in the person's language."),
            header: z.string().optional().describe("Two or three words naming the subject, shown as a tag."),
            multiSelect: z.boolean().optional().describe("Whether more than one option can be picked."),
            options: z
              .array(z.object({ label: z.string(), description: z.string().optional() }))
              .min(2)
              .max(4)
              .describe("Two to four answers to choose from, the one you would recommend first."),
          }),
        )
        .min(1)
        .max(3),
    },
    annotations: READ_ONLY,
  },
  {
    name: "plan_ready",
    kind: "plan",
    providerOnly: true,
    description:
      "In plan mode, once the plan is written in your reply, call this with the plan so the person can approve it. They approve it to be carried out asking before each change or on its own, or they ask for changes to the plan. Only after approval may the course change.",
    schema: { plan: z.string().describe("The plan, in the person's language, in Markdown: what will change, step by step, naming the nodes (passos).") },
    annotations: READ_ONLY,
  },
];

/** The tools a provider is given: the two above only when it has no tool of its own for them. */
export const toolsFor = (/** @type {boolean} */ withAskAndPlan) => TOOLS.filter((t) => withAskAndPlan || !t.providerOnly);

const named = (/** @type {ToolKind[]} */ kinds) => TOOLS.filter((t) => kinds.includes(t.kind)).map((t) => qualified(t.name));

/** Tools that change a course: they wait for the person's approval unless the editor is set to edit on its own. */
export const EDIT_TOOLS = named(["edit"]);

/** Tools that only read, or only move the view: never asked about. */
export const FREE_TOOLS = named(["read", "view"]);

/** The kind of a tool, by its name, qualified or not. */
export const kindOf = (/** @type {string} */ name) => {
  const plain = name.startsWith(`mcp__${SERVER}__`) ? name.slice(`mcp__${SERVER}__`.length) : name;
  return TOOLS.find((t) => t.name === plain)?.kind;
};

/** @typedef {{ content: { type: "text"; text: string }[]; isError?: boolean }} ToolResult */
