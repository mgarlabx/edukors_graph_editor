// @ts-check
/**
 * The tools the agent works on the course with.
 *
 * They are declared here, where the Agent SDK needs them, and run in the
 * editor: each call goes to the webview (src/agent/editorTools.ts), which
 * reads or changes the course through the same store as the canvas and the
 * inspector, so every change is validated and can be undone with ⌘Z.
 */
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const SERVER = "edukors";

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

/** Tools that change a course: they wait for the person's approval unless the editor is set to edit on its own. */
export const EDIT_TOOLS = ["edit_course", "replace_course", "new_course"].map((name) => `mcp__${SERVER}__${name}`);

/** Tools that only read, or only move the view: never asked about. */
export const FREE_TOOLS = ["get_editor_state", "read_course", "validate_course", "get_schema", "show_node", "auto_layout"].map((name) => `mcp__${SERVER}__${name}`);

/** @typedef {{ content: { type: "text"; text: string }[]; isError?: boolean }} ToolResult */

/**
 * @param {(name: string, args: Record<string, unknown>) => Promise<ToolResult>} callEditor
 */
export function editorServer(callEditor) {
  /**
   * @param {string} name
   * @param {string} description
   * @param {import("zod").ZodRawShape} shape
   * @param {Record<string, boolean>} annotations
   */
  const def = (name, description, shape, annotations) =>
    tool(name, description, shape, (args) => callEditor(name, /** @type {Record<string, unknown>} */ (args)), {
      annotations,
      alwaysLoad: true,
    });

  return createSdkMcpServer({
    name: SERVER,
    version: "1.0.0",
    tools: [
      def(
        "get_editor_state",
        "What is open in the editor now: the course on screen (title, file, languages, size, problems, unsaved changes), the other courses open in tabs, what is selected on the canvas and which view (Graph, JSON or Preview) is showing. Each message already brings this; call it when you need it fresh in the middle of a task.",
        {},
        { readOnlyHint: true, openWorldHint: false },
      ),
      def(
        "read_course",
        "Reads the course this conversation works on (the one on screen when the person wrote). Without arguments: an outline with the course info, every node (id, type, section, title), every edge in order with its index, and the keys the nodes produce for conditions and {{STORAGE}}. With `nodes`: the full JSON of those nodes and the edges into and out of them. With `full: true`: the whole course JSON, which is long for big courses — prefer the outline and the nodes you need.",
        {
          nodes: z.array(z.string()).optional().describe("Ids of the nodes to read in full."),
          full: z.boolean().optional().describe("The whole course JSON."),
        },
        { readOnlyHint: true, openWorldHint: false },
      ),
      def(
        "validate_course",
        "Validates the course with the editor's checks — the same rules as the official validate_course.py, plus the JSON schema — and lists every error and warning with where it is. Errors stop the course from working; warnings are advice.",
        {},
        { readOnlyHint: true, openWorldHint: false },
      ),
      def(
        "get_schema",
        "The Edukors Graph JSON schema, which documents every field with its rules and advice. Without arguments: the list of its definitions. With `definition` (courseInfo, node, quizContent, quizQuestion, formField, boolContent, dynamicMdContent, judgeState, choiceQuestion, scoreQuestion, noulQuestion, edge, comparison…): that definition. With `definition: \"all\"`: the whole schema, which is long.",
        { definition: z.string().optional() },
        { readOnlyHint: true, openWorldHint: false },
      ),
      def(
        "edit_course",
        "Changes the course with a list of operations applied together, as one step the person can undo with ⌘Z. If any operation cannot be applied (an unknown id, an id already taken, a wrong prefix), nothing changes and the error says which. Returns what changed and the validation of the result.",
        {
          summary: z.string().describe("One short sentence, in the person's language, saying what the change does. The person reads it when approving."),
          operations: z.array(operation).min(1),
        },
        { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      ),
      def(
        "replace_course",
        "Replaces the whole course with a new JSON object { $schema, info, nodes, edges }: for writing a course from scratch or restructuring all of it. Keep info.course-id. For changes to part of a course use edit_course. Undoable with ⌘Z.",
        {
          summary: z.string().describe("One short sentence, in the person's language, saying what the new course is."),
          course: z.record(z.string(), z.unknown()),
        },
        { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      ),
      def(
        "new_course",
        "Opens a new, blank course in a new tab (one static-md step, sm1) and makes it the course this conversation works on. Use it when the person asks for a new course rather than changes to the one on screen, then write it with edit_course or replace_course.",
        {
          title: z.string(),
          language: z.string().describe("The source language: an ISO 639-1 code, optionally with a region (pt, en, pt-BR)."),
        },
        { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      ),
      def(
        "show_node",
        "Selects a node and centers the canvas on it, in the Graph view, so the person sees it.",
        { id: z.string() },
        { readOnlyHint: true, openWorldHint: false },
      ),
      def(
        "auto_layout",
        "Arranges the nodes on the canvas automatically, as the editor's layout button does. Use it after adding several nodes or restructuring the graph.",
        {},
        { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      ),
    ],
  });
}
