// The AI assistant: Common's (accounts, panel, conversations kept in the .egrx, MCP servers, skills, review or apply),
// configured with the editor's instructions and its tools on the course (src/agent/toolSpecs.ts, editorTools.ts).
// Each tool acts on the course of the conversation, whichever tab is on screen; each change is one undo step.
// No documentPath: the agent's own file tools work in Common's private folder for the course, never in the folder
// of the course file (as in the Slides editor).
import { TOOLS, toolSpecs } from "../agent/toolSpecs";
import { runTool } from "../agent/editorTools";
import { messageContext } from "../agent/context";
import { systemPrompt } from "../agent/prompt";
import { activateDoc } from "../store/docs";
import { useEditor } from "../store/editor";
import { graphIdOf, type CommonDoc } from "./tabs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const common: any = globalThis;

/** How a tool appears in the conversation. */
const LABELS: Record<string, string> = {
  get_editor_state: "Read the editor",
  read_course: "Read the course",
  validate_course: "Checked the course",
  get_schema: "Read the format",
  edit_course: "Changed the course",
  replace_course: "Replaced the course",
  new_course: "New course",
  show_node: "Showed a step",
  auto_layout: "Arranged the map",
};

export function configureAssistant() {
  const specs = new Map(toolSpecs().map((s) => [s.name, s]));
  const tools = TOOLS.filter((t) => t.kind !== "plan").map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: specs.get(t.name)!.inputSchema,
    label: () => LABELS[t.name] ?? t.name,
    // Reading and moving the view never wait for approval; changes to a course do, in review mode.
    changes: t.kind === "edit",
    async run(doc: CommonDoc, args: Record<string, unknown>) {
      const id = graphIdOf(doc.id);
      const result = await runTool(t.name, args ?? {}, id);
      if (result.isError) throw new Error(result.text);
      if (result.docId) activateDoc(result.docId);
      return result.text;
    },
  }));
  common.EdukorsAiAssistant.configure({
    instructions: systemPrompt("", { skills: true, mcp: true }),
    documentId: (doc: CommonDoc) => `graph-${doc.id}`,
    // What the course on screen looks like, the other courses, the view and the selection, with every request.
    context: (doc: CommonDoc) => {
      const id = graphIdOf(doc.id);
      if (id && useEditor.getState().docId !== id) return { course: id };
      return { editor: messageContext(true, "ask").block };
    },
    tools,
  });
}
