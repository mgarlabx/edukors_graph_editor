/**
 * What each open course carries besides the course itself (store/docs.ts): the conversations of versions 2.19-2.20,
 * kept whole in its .egrx. Keyed by the editor's tab id.
 */
import { create } from "zustand";

export interface CourseExtras {
  legacyConversations?: Uint8Array;
}

interface ExtrasState {
  byDoc: Record<string, CourseExtras>;
}

export const useMedia = create<ExtrasState>()(() => ({ byDoc: {} }));

const EMPTY: CourseExtras = {};

export const extrasOf = (docId: string | null): CourseExtras => (docId && useMedia.getState().byDoc[docId]) || EMPTY;

export function setExtras(docId: string, patch: Partial<CourseExtras>) {
  useMedia.setState((s) => ({ byDoc: { ...s.byDoc, [docId]: { ...(s.byDoc[docId] ?? EMPTY), ...patch } } }));
}

export function forgetExtras(docId: string) {
  useMedia.setState((s) => {
    const { [docId]: _, ...rest } = s.byDoc;
    return { byDoc: rest };
  });
}
