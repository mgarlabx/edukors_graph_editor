/**
 * What the editor tells the agent with each message: the course on screen,
 * the other courses open, the view and, unless the person turned it off, the
 * selection. It goes in front of the message, in a block the panel does not
 * show (transcript.ts takes it off again when a conversation is read back).
 */
import { useEditor } from "../store/editor";
import { useDocs, docState } from "../store/docs";
import { docLabel } from "../app/files";
import { localize } from "../course/localize";
import { editorState } from "./editorTools";

export interface MessageContext {
  /** the block that goes in front of the message */
  block: string;
  /** the course on screen, which the conversation works on from this message */
  docId: string | null;
}

const VIEW = { canvas: "Graph", json: "JSON", preview: "Preview" } as const;

/**
 * The selection on screen as the chip of the composer shows it, and the
 * conversation beside each message: "q1 · Quiz title", "q1, q2", "sm1 → q1".
 */
export function selectionLabel(): string | null {
  const s = useEditor.getState();
  if (!s.course) return null;
  if (s.selection.nodes.length > 1) return s.selection.nodes.join(", ");
  const id = s.selection.nodes[0];
  if (id) {
    const node = s.course.nodes.find((n) => n.id === id);
    const title = node ? localize(node.title, s.canvasLang).trim() : "";
    return title ? `${id} · ${title}` : id;
  }
  if (s.selection.edge !== null) {
    const edge = s.course.edges[s.selection.edge];
    return edge ? `${edge.from} → ${edge.to}` : null;
  }
  return null;
}

export function messageContext(withSelection: boolean): MessageContext {
  const s = useEditor.getState();
  const lines: string[] = [];
  if (!s.course || !s.docId) {
    lines.push("No course is open in the editor.");
  } else {
    const d = editorState(s.docId).onScreen!;
    lines.push(
      `Course on screen: "${d.title || docLabel(s)}"${d.file ? ` — file ${d.file.split("/").pop()}` : " — not saved to a file yet"}${d.unsavedChanges ? " (unsaved changes)" : ""} — languages ${d.languages.join(", ")} — ${d.nodes} nodes, ${d.edges} edges — ${d.errors} errors, ${d.warnings} warnings — view: ${VIEW[s.tab]}.`,
    );
    const others = useDocs.getState().order.filter((id) => id !== s.docId);
    if (others.length) lines.push(`Also open in other tabs: ${others.map((id) => `"${docLabel(docState(id)!)}"`).join(", ")}.`);
    if (withSelection) {
      const nodes = s.selection.nodes.map((id) => s.course!.nodes.find((n) => n.id === id)).filter((n) => !!n);
      if (nodes.length) lines.push(`Selected: ${nodes.map((n) => `${n.id} (${n.type}) "${localize(n.title, s.canvasLang)}"`).join("; ")}.`);
      else if (s.selection.edge !== null && s.course.edges[s.selection.edge]) {
        const e = s.course.edges[s.selection.edge];
        lines.push(`Selected: the edge ${s.selection.edge} (${e.from} → ${e.to}).`);
      } else lines.push("Nothing is selected.");
    }
  }
  return { block: `<editor-context>\n${lines.join("\n")}\n</editor-context>`, docId: s.docId };
}
