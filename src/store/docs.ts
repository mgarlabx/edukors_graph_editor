/**
 * The courses open in tabs.
 *
 * The editor store holds one course at a time, the one on screen, and every
 * panel reads and edits it there. The others wait here, parked with all that
 * is theirs -- history, selection, layout, problems -- while the preview keeps
 * their simulated students on its side (preview/session.ts). Switching tabs
 * parks the course on screen and brings the chosen one back, so the canvas,
 * the inspector and the rest never need to know there is more than one.
 *
 * Nodes go from one course to another through the clipboard: copied in one
 * tab, pasted in another (app/clipboard.ts).
 */
import { create } from "zustand";
import { isDirty, useEditor, type DocSlice } from "./editor";
import { useUi } from "./ui";
import { forgetSession, switchSession } from "../preview/session";
import type { Course } from "../schema/types";
import type { JsonStyle } from "../course/serialize";

interface DocsState {
  /** every open course, in tab order; the one on screen is the editor's docId */
  order: string[];
  /** the open courses not on screen */
  parked: Record<string, DocSlice>;
}

export const useDocs = create<DocsState>()(() => ({ order: [], parked: {} }));

let seq = 0;
// Unique across sessions too: a clipboard can outlive the app.
const newId = () => `doc-${Date.now().toString(36)}-${++seq}`;

const leaving = new Set<() => void>();

/**
 * Runs `fn` before the course on screen leaves it or closes, while it is still
 * on screen: what is on its way into it (typing in the JSON tab) gets there
 * first. Returns the way to stop.
 */
export const onLeave = (fn: () => void) => {
  leaving.add(fn);
  return () => void leaving.delete(fn);
};

export const flushPending = () => leaving.forEach((fn) => fn());

/** The state of an open course, whether on screen or parked. */
export const docState = (id: string): DocSlice | undefined => {
  const live = useEditor.getState();
  return live.docId === id ? live : useDocs.getState().parked[id];
};

/** Changes an open course wherever it is, for work that ends after its tab may have been left (a save, a write). */
export function patchDoc(id: string | null, patch: Partial<Omit<DocSlice, "docId">>) {
  if (!id) return;
  if (useEditor.getState().docId === id) return useEditor.setState(patch);
  useDocs.setState((s) => (s.parked[id] ? { parked: { ...s.parked, [id]: { ...s.parked[id], ...patch } } } : s));
}

const withoutParked = (parked: Record<string, DocSlice>, id: string) => {
  const rest = { ...parked };
  delete rest[id];
  return rest;
};

/** Parks the course on screen in its tab. */
function park() {
  const editor = useEditor.getState();
  if (!editor.docId) return;
  flushPending();
  const doc = useEditor.getState().park();
  useDocs.setState((s) => ({ parked: { ...s.parked, [doc.docId!]: doc } }));
}

/** What changes with the course on screen: its preview, and the dialogs that were about the one before. */
function arrived(id: string | null) {
  switchSession(id);
  useUi.setState((s) => ({ modal: s.modal === "languages" || s.modal === "probe" ? null : s.modal }));
}

function bring(id: string) {
  const doc = useDocs.getState().parked[id];
  if (!doc) return;
  useEditor.getState().restore(doc);
  useDocs.setState((s) => ({ parked: withoutParked(s.parked, id) }));
  arrived(id);
}

/** Opens a course in a new tab, after the others, and shows it. */
export function openDoc(course: Course, opts: { path: string | null; style?: JsonStyle; saved?: boolean }): string {
  park();
  const id = newId();
  useEditor.getState().load(course, { ...opts, docId: id });
  useDocs.setState((s) => ({ order: [...s.order, id] }));
  arrived(id);
  return id;
}

/** Shows an open course. */
export function activateDoc(id: string) {
  if (useEditor.getState().docId === id || !useDocs.getState().parked[id]) return;
  park();
  bring(id);
}

/**
 * Closes a tab without asking: whether its unsaved changes may go is the
 * caller's to settle (app/files.ts). Closing the one on screen shows the tab
 * to its right, or to its left at the end.
 */
export function dropDoc(id: string) {
  const { order } = useDocs.getState();
  const at = order.indexOf(id);
  if (at === -1) return;
  const rest = order.filter((x) => x !== id);
  if (useEditor.getState().docId === id) {
    flushPending();
    const next = rest[Math.min(at, rest.length - 1)];
    if (next) bring(next);
    else {
      useEditor.getState().unload();
      arrived(null);
    }
  }
  useDocs.setState((s) => ({ order: rest, parked: withoutParked(s.parked, id) }));
  forgetSession(id);
}

/** The tab `step` places from the one on screen, going round. */
export function cycleDoc(step: number) {
  const { order } = useDocs.getState();
  const at = order.indexOf(useEditor.getState().docId ?? "");
  if (order.length < 2 || at === -1) return;
  activateDoc(order[(((at + step) % order.length) + order.length) % order.length]);
}

/** The n-th tab, from 1; 9 is always the last, as in browsers. */
export function activateNth(n: number) {
  const { order } = useDocs.getState();
  const id = n >= 9 ? order[order.length - 1] : order[n - 1];
  if (id) activateDoc(id);
}

/** Moves a tab beside another (dragging tabs). */
export function moveDoc(id: string, target: string, after: boolean) {
  useDocs.setState((s) => {
    const order = s.order.filter((x) => x !== id);
    const at = order.indexOf(target);
    if (at === -1 || id === target) return s;
    order.splice(after ? at + 1 : at, 0, id);
    return { order };
  });
}

/** The tab with this file open, if any. */
export const docWithPath = (path: string) => useDocs.getState().order.find((id) => docState(id)?.path === path);

/** The open courses with changes not saved, the one on screen first. */
export function dirtyDocs(): string[] {
  const active = useEditor.getState().docId;
  const dirty = useDocs.getState().order.filter((id) => {
    const doc = docState(id);
    return !!doc && isDirty(doc);
  });
  return dirty.sort((a, b) => Number(b === active) - Number(a === active));
}
