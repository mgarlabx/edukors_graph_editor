// Common's document tabs and the editor's courses (src/store/docs.ts), kept in step. Common owns the tabs, Save,
// Open, Recent, close prompts and drafts; the editor owns each course, its history and what is on screen.
//   - a tab Common creates by itself (New) gets a new course;
//   - a course the editor opens by itself (a sample, the assistant's new_course) gets a tab;
//   - the active tab is the course on screen; a closed tab drops its course and its media;
//   - each change of a course is reported to Common (edukors:document-changed keeps its draft current), and
//     doc.modified follows whether the course differs from what was last saved (edukors:document-modified).
import { activateDoc, docState, dropDoc, useDocs } from "../store/docs";
import { isDirty, useEditor } from "../store/editor";
import { forgetExtras, useMedia } from "../store/extras";
import { createCourse } from "../app/files";

/* eslint-disable @typescript-eslint/no-explicit-any */
const common: any = globalThis;

export interface CommonDoc {
  id: number;
  name?: string;
  saved?: boolean;
  modified?: boolean;
  path?: string;
  folder?: string;
  file?: string;
  origin?: string;
}

const toGraph = new Map<number, string>();
const toCommon = new Map<string, number>();

export const graphIdOf = (commonId: number): string | null => toGraph.get(commonId) ?? null;
export const commonDocOf = (graphId: string): CommonDoc | undefined => {
  const id = toCommon.get(graphId);
  return id === undefined ? undefined : (common.EdukorsDocuments.list() as CommonDoc[]).find((d) => d.id === id);
};

export function link(commonId: number, graphId: string) {
  toGraph.set(commonId, graphId);
  toCommon.set(graphId, commonId);
}

/** The course on screen, in the files of Common's tab: what an export must not replace. */
export const protectedFiles = (doc: CommonDoc | undefined) => [doc?.path, doc?.origin].filter((p): p is string => !!p);

let syncing = false;

/** Runs fn without bringing the lists together meanwhile (a course being adopted into a tab Common just added). */
export function paused<T>(fn: () => T): T {
  const was = syncing;
  syncing = true;
  try {
    return fn();
  } finally {
    syncing = was;
  }
}

/** Brings the two lists together; runs on Common's documents-changed and on the editor's own changes of tabs. */
export function syncTabs() {
  if (syncing) return;
  syncing = true;
  try {
    const docs = common.EdukorsDocuments.list() as CommonDoc[];
    const live = new Set(docs.map((d) => d.id));
    // Closed tabs: their courses go, with their media.
    for (const [commonId, graphId] of [...toGraph]) {
      if (live.has(commonId)) continue;
      toGraph.delete(commonId);
      toCommon.delete(graphId);
      if (docState(graphId)) dropDoc(graphId);
      forgetExtras(graphId);
    }
    // Tabs Common made by itself (New): a new course each.
    for (const doc of docs) if (!toGraph.has(doc.id)) link(doc.id, createCourse());
    // Courses the editor opened by itself: a tab each.
    for (const graphId of useDocs.getState().order) {
      if (toCommon.has(graphId)) continue;
      const doc = common.EdukorsDocuments.add({}) as CommonDoc;
      link(doc.id, graphId);
      common.EdukorsDocuments.activate(doc.id);
    }
    // The active tab is the course on screen.
    const active = common.EdukorsDocuments.active() as CommonDoc | undefined;
    const graphId = active ? toGraph.get(active.id) : undefined;
    if (graphId && useEditor.getState().docId !== graphId) activateDoc(graphId);
  } finally {
    syncing = false;
  }
}

/** Reports each change of a course to Common: its modified state and its draft. */
export function watchChanges() {
  let last = new Map<string, unknown>();
  const report = () => {
    const now = new Map<string, unknown>();
    for (const graphId of useDocs.getState().order) {
      const doc = docState(graphId);
      if (!doc) continue;
      now.set(graphId, doc.course);
      const tab = commonDocOf(graphId);
      if (!tab) continue;
      if (last.has(graphId) && last.get(graphId) !== doc.course) document.dispatchEvent(new CustomEvent("edukors:document-changed", { detail: { id: tab.id } }));
      const modified = isDirty(doc);
      if (!!tab.modified !== modified) {
        tab.modified = modified;
        document.dispatchEvent(new CustomEvent("edukors:document-modified", { detail: { id: tab.id } }));
      }
    }
    last = now;
  };
  useEditor.subscribe(report);
  useDocs.subscribe(() => {
    report();
    syncTabs();
  });
  useMedia.subscribe(report);
}
