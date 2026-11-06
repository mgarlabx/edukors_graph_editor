// The course as Common's shell sees it (EdukorsAppDocument): Save writes an .egrx (src/course/egrx.ts); Open and
// Recent read an .egrx, or an .egf / older .json as a course without a file of its own (an import: Save then asks
// where to save the .egrx, and the original is never written: no saveOriginal, no saveExtensions).
import { decodeEgrx, encodeEgrx, importEgf, CourseFileError, type CourseFile } from "../course/egrx";
import { docState, flushPending, openDoc, patchDoc } from "../store/docs";
import { useEditor } from "../store/editor";
import { positionsOf } from "../store/layout";
import { extrasOf, setExtras } from "../store/extras";
import { graphIdOf, link, paused, type CommonDoc } from "./tabs";
import { native } from "../app/platform";
import { legacyConversationsOf } from "./legacy-conversations";
import type { Course } from "../schema/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const common: any = globalThis;
declare const __PACKAGE_VERSION__: string | undefined;

type Content = CourseFile & { imported?: boolean };

const placed = (course: Course) => Array.isArray(course.nodes) && course.nodes.every((n) => positionsOf(course)[n?.id]);

async function toBytes(doc: CommonDoc) {
  const id = graphIdOf(doc.id);
  flushPending();
  const state = id ? docState(id) : undefined;
  if (!id || !state?.course) throw new Error("The course is no longer open.");
  const extras = extrasOf(id);
  const course = state.course;
  const bytes = await encodeEgrx(
    { course, style: state.style, conversations: common.EdukorsAiAssistant.conversationsOf(doc), legacyConversations: extras.legacyConversations },
    { version: typeof __PACKAGE_VERSION__ === "string" ? `v.${__PACKAGE_VERSION__}` : "dev" },
  );
  // What was written, not what the course may become while the file is being written.
  return { bytes, committed: { id, course } };
}

async function fromBytes(bytes: Uint8Array): Promise<Content> {
  try {
    return await decodeEgrx(bytes);
  } catch (e) {
    throw new Error(e instanceof CourseFileError ? e.message : "This is not a valid course file.");
  }
}

/** .egf and older .json courses become courses without a file; nothing is ever written back into them. */
async function importFile({ format, bytes }: { format: string; bytes: Uint8Array }): Promise<Content> {
  if (format !== "egf" && format !== "json") throw new Error("Unsupported course format.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("This file is not UTF-8 text.");
  }
  try {
    return { ...importEgf(text), imported: true };
  } catch (e) {
    throw new Error(e instanceof CourseFileError ? e.message : String(e));
  }
}

function adopt(doc: CommonDoc, content: Content) {
  paused(() => {
    // An import is a course not saved yet: closing it asks, and Save asks where to save the .egrx.
    const id = openDoc(content.course, { path: content.imported ? null : (doc.path ?? null), style: content.style, saved: !content.imported });
    link(doc.id, id);
    setExtras(id, { legacyConversations: content.legacyConversations });
    // An .egf of 2.19-2.20 brings the conversations that version kept about it, whole, into its .egrx.
    if (content.imported && doc.origin)
      void native
        .legacyConversations(doc.origin)
        .then((bytes) => {
          if (!bytes) return;
          setExtras(id, { legacyConversations: bytes });
          // And into the course's history, where they open as Common's conversations.
          const list = legacyConversationsOf(bytes).map((c) => common.EdukorsAiConversations.deserialize(c)).filter(Boolean);
          if (list.length) common.EdukorsAiAssistant.restoreConversations(doc, list);
        })
        .catch(() => undefined);
    if (!placed(content.course)) useEditor.getState().requestLayout();
  });
  common.EdukorsAiAssistant.restoreConversations(doc, content.conversations ?? []);
}

export function installDocument() {
  common.EdukorsAppDocument = Object.freeze({ toBytes, fromBytes, importFile, adopt, selectAll: () => document.dispatchEvent(new CustomEvent("graph:command", { detail: "select-all" })) });
  // Saved: the course as written becomes its saved state, and the tab is that file from now on.
  document.addEventListener("edukors:document-saved", ((event: CustomEvent) => {
    const { doc, committed } = event.detail as { doc: CommonDoc; committed?: { id: string; course: Course } };
    const id = graphIdOf(doc.id);
    if (!id) return;
    patchDoc(id, { path: doc.path ?? null, ...(committed?.id === id ? { savedCourse: committed.course } : {}) });
  }) as EventListener);
}
