/**
 * The agent's tools, run in the editor. Their descriptions, which are what
 * Claude reads, are in agent/tools.mjs.
 *
 * They work on the course of the conversation: the one on screen when the
 * person last wrote, which may since have gone to another tab. Reading it
 * leaves the screen alone; changing it brings it back on screen first, so the
 * person sees what changes, and goes through the store like any other edit:
 * one undo step per call, validated, nodes kept where they were on the canvas.
 */
import { useEditor, isDirty, courseLangs } from "../store/editor";
import { positionsOf } from "../store/layout";
import { activateDoc, docState, openDoc, useDocs } from "../store/docs";
import { docLabel } from "../app/files";
import { diagnose } from "../validate";
import { newCourse } from "../course/factory";
import { localize } from "../course/localize";
import { stringify } from "../course/serialize";
import { LANG_RE } from "../i18n/languages";
import schema from "../schema/schema.json";
import type { Course } from "../schema/types";
import { applyOperations, EditError, nodesInFull, outline, placeAdded, problems, type Operation } from "./courseEdits";

export interface ToolResult {
  text: string;
  isError?: boolean;
  /** the course the conversation works on from now on, when the tool opened one */
  docId?: string;
}

const json = (value: unknown) => JSON.stringify(value, null, 1);

const VIEW = { canvas: "Graph", json: "JSON", preview: "Preview" } as const;

/** The course a tool acts on: the conversation's, else the one on screen. */
function target(docId: string | null): { id: string; course: Course } {
  for (const id of [docId, useEditor.getState().docId]) {
    const course = id ? docState(id)?.course : null;
    if (id && course) return { id, course };
  }
  throw new EditError("No course is open in the editor. Ask the person to open one or start a new one.");
}

/** Brings a course on screen before it is changed. */
function onScreen(id: string) {
  if (useEditor.getState().docId !== id) activateDoc(id);
  if (useEditor.getState().docId !== id) throw new EditError("That course could not be brought on screen.");
}

const describe = (id: string) => {
  const doc = docState(id)!;
  const d = doc.diagnostics ?? (doc.course ? diagnose(doc.course) : null);
  return {
    title: doc.course ? localize(doc.course.info?.title, doc.course.info?.["source-language"] ?? "en") : "",
    file: doc.path,
    unsavedChanges: isDirty(doc),
    languages: courseLangs(doc.course),
    nodes: doc.course?.nodes?.length ?? 0,
    edges: doc.course?.edges?.length ?? 0,
    errors: d?.errors ?? 0,
    warnings: d?.warnings ?? 0,
  };
};

const heading = (id: string) => {
  const doc = docState(id)!;
  return `Course "${describe(id).title || docLabel(doc)}"${doc.path ? ` (${doc.path.split("/").pop()})` : ""}`;
};

/** What the editor shows: the courses open, the one on screen, the selection, the view. */
export function editorState(docId: string | null) {
  const s = useEditor.getState();
  const selected = s.course ? s.selection.nodes.map((id) => s.course!.nodes.find((n) => n.id === id)).filter(Boolean) : [];
  const edge = s.course && s.selection.edge !== null ? s.course.edges[s.selection.edge] : undefined;
  return {
    onScreen: s.docId ? describe(s.docId) : null,
    conversationCourse: docId && docId !== s.docId && docState(docId) ? describe(docId) : undefined,
    openCourses: useDocs.getState().order.map((id) => ({ name: docLabel(docState(id)!), onScreen: id === s.docId })),
    view: VIEW[s.tab],
    selection: {
      nodes: selected.map((n) => ({ id: n!.id, type: n!.type, title: localize(n!.title, s.canvasLang) })),
      edge: edge ? { index: s.selection.edge, from: edge.from, to: edge.to } : null,
    },
  };
}

function readCourse(docId: string | null, args: { nodes?: unknown; full?: unknown }): ToolResult {
  const { id, course } = target(docId);
  if (args.full) return { text: `${heading(id)}, in full:\n${stringify(course, docState(id)!.style)}` };
  if (Array.isArray(args.nodes) && args.nodes.length) return { text: `${heading(id)}, nodes ${args.nodes.join(", ")}:\n${json(nodesInFull(course, args.nodes.map(String)))}` };
  return { text: `${heading(id)}, in outline (read nodes in full with \`nodes\`):\n${json(outline(course))}\n\nValidation: ${problems(docState(id)!.diagnostics ?? diagnose(course), 10)}` };
}

const defs = (schema as { $defs: Record<string, { description?: string }> }).$defs;

function getSchema(args: { definition?: unknown }): ToolResult {
  const name = typeof args.definition === "string" ? args.definition.trim() : "";
  if (!name) {
    const lines = Object.entries(defs).map(([k, v]) => `- ${k}: ${String(v.description ?? "").split(/(?<=\.)\s/)[0]}`);
    return { text: `${(schema as { description?: string }).description ?? ""}\n\nDefinitions (get_schema with one of these names gives it in full; "course" gives the top level, "all" the whole schema):\n${lines.join("\n")}` };
  }
  if (name === "all") return { text: JSON.stringify(schema) };
  if (name === "course") {
    const { $defs: _defs, ...top } = schema as Record<string, unknown>;
    return { text: json(top) };
  }
  const def = defs[name];
  if (!def) return { text: `There is no definition "${name}". The definitions are: course, ${Object.keys(defs).join(", ")}.`, isError: true };
  return { text: json(def) };
}

function editCourse(docId: string | null, args: { operations?: unknown }): ToolResult {
  const { id } = target(docId);
  onScreen(id);
  const store = useEditor.getState();
  const draft = structuredClone(store.course!);
  const applied = applyOperations(draft, args.operations as Operation[]);
  store.replace(draft, `agent:${Date.now()}`);
  const placed = placeAdded(draft, positionsOf(draft), applied.added);
  if (Object.keys(placed).length) useEditor.getState().setPositions(placed);
  return {
    text: `${heading(id)}: applied ${applied.changes.length} operation${applied.changes.length === 1 ? "" : "s"} as one undo step.\n${applied.changes.map((c) => `- ${c}`).join("\n")}\n\nValidation: ${problems(diagnose(draft))}`,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function replaceCourse(docId: string | null, args: { course?: unknown }): ToolResult {
  const next = args.course;
  if (!isObject(next) || !isObject(next.info) || !Array.isArray(next.nodes) || !Array.isArray(next.edges))
    throw new EditError("A course is an object with info, nodes and edges.");
  const course = structuredClone(next) as unknown as Course;
  let opened: string | undefined;
  let id: string;
  try {
    id = target(docId).id;
  } catch {
    id = opened = openDoc(course, { path: null, saved: false });
  }
  if (!opened) {
    onScreen(id);
    const store = useEditor.getState();
    const kept = store.course!.info["course-id"];
    const before = positionsOf(store.course);
    if (kept) course.info["course-id"] = kept;
    store.replace(course, `agent:${Date.now()}`);
    // A node written again without its position stays where it was.
    const given = positionsOf(course);
    store.setPositions(Object.fromEntries(Object.entries(before).filter(([n]) => !given[n])));
  }
  const positions = positionsOf(useEditor.getState().course);
  const unplaced = course.nodes.filter((n) => n && !positions[n.id]).length;
  if (unplaced > 1) useEditor.getState().requestLayout();
  return {
    text: `${heading(id)}: ${opened ? "opened in a new tab" : "replaced, as one undo step"}; ${course.nodes.length} nodes, ${course.edges.length} edges${unplaced > 1 ? ", arranged automatically on the canvas" : ""}.\n\nValidation: ${problems(diagnose(course))}`,
    docId: opened,
  };
}

function newCourseTool(args: { title?: unknown; language?: unknown }): ToolResult {
  const lang = String(args.language ?? "").trim();
  if (!LANG_RE.test(lang)) throw new EditError(`"${lang}" is not a language code (pt, en, pt-BR…).`);
  const title = String(args.title ?? "").trim();
  const id = openDoc(newCourse(lang, title), { path: null, saved: true });
  return {
    text: `Opened a new course, "${title}", in a new tab (${lang}). It has one static-md step, sm1, which is the start. This conversation now works on it.`,
    docId: id,
  };
}

function showNode(docId: string | null, args: { id?: unknown }): ToolResult {
  const { id, course } = target(docId);
  const node = course.nodes.find((n) => n.id === args.id);
  if (!node) throw new EditError(`There is no node ${String(args.id)}.`);
  onScreen(id);
  useEditor.getState().reveal({ node: node.id });
  return { text: `Showing ${node.id} on the canvas, selected.` };
}

function autoLayout(docId: string | null): ToolResult {
  const { id } = target(docId);
  onScreen(id);
  useEditor.getState().setTab("canvas");
  useEditor.getState().requestLayout();
  return { text: "The nodes are being arranged on the canvas." };
}

/** Runs one tool call from the agent. Errors are returned to Claude, not thrown. */
export async function runTool(name: string, args: Record<string, unknown>, docId: string | null): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_editor_state":
        return { text: json(editorState(docId)) };
      case "read_course":
        return readCourse(docId, args);
      case "validate_course": {
        const { id, course } = target(docId);
        return { text: `${heading(id)}: ${problems(diagnose(course), 300)}` };
      }
      case "get_schema":
        return getSchema(args);
      case "edit_course":
        return editCourse(docId, args);
      case "replace_course":
        return replaceCourse(docId, args);
      case "new_course":
        return newCourseTool(args);
      case "show_node":
        return showNode(docId, args);
      case "auto_layout":
        return autoLayout(docId);
      default:
        return { text: `The editor has no tool called ${name}.`, isError: true };
    }
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), isError: true };
  }
}
