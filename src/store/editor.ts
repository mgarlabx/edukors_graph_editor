/**
 * The one place a course changes.
 *
 * The canvas, the inspector and the JSON tab all edit through update(), which
 * copies the course, applies the change, records an undo step and schedules
 * validation. The course held here is exactly what will be saved, the place of
 * each node included; what else the editor keeps lives in the layout beside it.
 *
 * It holds the course on screen. Other open courses wait in their tabs
 * (store/docs.ts), each with its own history, selection and layout: park()
 * hands those over and restore() takes them back.
 */
import { create } from "zustand";
import type { Course, CourseNode } from "../schema/types";
import { diagnose, type Diagnostics } from "../validate";
import { DEFAULT_STYLE, stringify, type JsonStyle } from "../course/serialize";
import { emptyLayout, placeNodes, type Layout, type Position } from "./layout";

export type Tab = "canvas" | "json" | "preview";
export type Selection = { nodes: string[]; edge: number | null };

const LIMIT = 200;
const COALESCE_MS = 900;

/** Everything that belongs to one open course: what its tab keeps while another is on screen. */
export interface DocSlice {
  /** the tab the course is open in; null with no course open */
  docId: string | null;
  course: Course | null;
  layout: Layout;
  path: string | null;
  style: JsonStyle;
  /** the course object as last saved: identity tells whether anything changed */
  savedCourse: Course | null;
  past: Course[];
  future: Course[];
  lastLabel: string | null;
  lastAt: number;
  selection: Selection;
  diagnostics: Diagnostics | null;
  canvasLang: string;
  /** a request for the canvas to frame something; the canvas clears it */
  focus: { node?: string; edge?: number; fit?: boolean; field?: string; at: number } | null;
  /** a request for an automatic layout; the canvas clears it once done */
  layoutRequested: number;
}

export interface EditorState extends DocSlice {
  /** what the stage shows; the same whichever course is on screen */
  tab: Tab;

  load(course: Course, opts: { docId: string; path: string | null; style?: JsonStyle; saved?: boolean }): void;
  /** The state of the course on screen, for its tab to keep while another comes in. */
  park(): DocSlice;
  /** A parked course back on screen. */
  restore(doc: DocSlice): void;
  /** No course on screen: the last tab was closed. */
  unload(): void;
  update(change: (draft: Course) => void, label?: string): void;
  replace(course: Course, label?: string): void;
  /** Moves these nodes; the others stay where they are. */
  setPositions(moves: Record<string, Position>, record?: boolean): void;
  setLayout(change: (draft: Layout) => void): void;
  undo(): void;
  redo(): void;
  select(selection: Partial<Selection>): void;
  setTab(tab: Tab): void;
  setCanvasLang(lang: string): void;
  reveal(target: { node?: string; edge?: number; field?: string }): void;
  fit(): void;
  requestLayout(): void;
  serialized(): string;
  node(id: string): CourseNode | undefined;
}

let validateTimer: ReturnType<typeof setTimeout> | undefined;

const noDoc = (): DocSlice => ({
  docId: null,
  course: null,
  layout: emptyLayout(),
  path: null,
  style: DEFAULT_STYLE,
  savedCourse: null,
  past: [],
  future: [],
  lastLabel: null,
  lastAt: 0,
  selection: { nodes: [], edge: null },
  diagnostics: null,
  canvasLang: "en",
  focus: null,
  layoutRequested: 0,
});

export const useEditor = create<EditorState>()((set, get) => {
  const scheduleValidation = () => {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => {
      const course = get().course;
      set({ diagnostics: course ? diagnose(course) : null });
    }, 120);
  };

  /** Pushes an undo step, folding quick repeats of the same edit into one. */
  const record = (label: string | undefined) => {
    const s = get();
    const now = Date.now();
    const snap = s.course;
    if (!snap) return;
    if (label && label === s.lastLabel && now - s.lastAt < COALESCE_MS) {
      set({ lastAt: now, future: [] });
      return;
    }
    set({ past: [...s.past, snap].slice(-LIMIT), future: [], lastLabel: label ?? null, lastAt: now });
  };

  return {
    ...noDoc(),
    tab: "canvas",

    load(course, { docId, path, style, saved }) {
      set({
        ...noDoc(),
        docId,
        course,
        path,
        style: style ?? DEFAULT_STYLE,
        savedCourse: saved ? course : null,
        canvasLang: course?.info?.["source-language"] ?? "en",
        diagnostics: diagnose(course),
        focus: { fit: true, at: Date.now() },
      });
    },

    park() {
      const s = get();
      return {
        docId: s.docId,
        course: s.course,
        layout: s.layout,
        path: s.path,
        style: s.style,
        savedCourse: s.savedCourse,
        past: s.past,
        future: s.future,
        lastLabel: s.lastLabel,
        lastAt: s.lastAt,
        selection: s.selection,
        diagnostics: s.diagnostics,
        canvasLang: s.canvasLang,
        focus: s.focus,
        layoutRequested: s.layoutRequested,
      };
    },

    restore(doc) {
      set(doc);
      // A validation still pending when it was parked never reached it.
      scheduleValidation();
    },

    unload() {
      clearTimeout(validateTimer);
      set(noDoc());
    },

    update(change, label) {
      const s = get();
      if (!s.course) return;
      record(label);
      const draft = structuredClone(s.course);
      change(draft);
      set({ course: draft });
      scheduleValidation();
    },

    replace(course, label = "replace") {
      if (!get().course) return;
      record(label);
      set({ course });
      scheduleValidation();
    },

    setPositions(moves, recordStep = false) {
      const s = get();
      if (!s.course) return;
      const course = placeNodes(s.course, moves);
      if (course === s.course) return;
      if (recordStep) record("move");
      set({ course });
      scheduleValidation();
    },

    setLayout(change) {
      const draft = structuredClone(get().layout);
      change(draft);
      set({ layout: draft });
    },

    undo() {
      const s = get();
      const prev = s.past[s.past.length - 1];
      const cur = s.course;
      if (!prev || !cur) return;
      set({
        course: prev,
        past: s.past.slice(0, -1),
        future: [...s.future, cur],
        lastLabel: null,
      });
      scheduleValidation();
    },

    redo() {
      const s = get();
      const next = s.future[s.future.length - 1];
      const cur = s.course;
      if (!next || !cur) return;
      set({
        course: next,
        future: s.future.slice(0, -1),
        past: [...s.past, cur],
        lastLabel: null,
      });
      scheduleValidation();
    },

    select(selection) {
      set((s) => ({ selection: { ...s.selection, ...selection } }));
    },

    setTab(tab) {
      set({ tab });
    },

    setCanvasLang(lang) {
      set({ canvasLang: lang });
    },

    reveal(target) {
      set({
        tab: "canvas",
        selection: { nodes: target.node ? [target.node] : [], edge: target.edge ?? null },
        focus: { ...target, at: Date.now() },
      });
    },

    fit() {
      set({ focus: { fit: true, at: Date.now() } });
    },

    requestLayout() {
      set({ layoutRequested: Date.now() });
    },

    serialized() {
      const s = get();
      return s.course ? stringify(s.course, s.style) : "";
    },

    node(id) {
      return get().course?.nodes.find((n) => n.id === id);
    },
  };
});

export const isDirty = (s: Pick<DocSlice, "course" | "savedCourse">) => s.course !== null && s.course !== s.savedCourse;

/** The languages of the course, source first. */
export const courseLangs = (course: Course | null): string[] => {
  if (!course?.info) return [];
  const source = course.info["source-language"];
  const others = Array.isArray(course.info["other-languages"]) ? course.info["other-languages"] : [];
  return [source, ...others.filter((l) => l !== source)].filter(Boolean);
};
