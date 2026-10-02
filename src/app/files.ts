/**
 * New, open, save, save as, close, export (plan 5.8).
 *
 * A course is two files: the course, written in the style it was read in so
 * that opening and saving changes nothing, and the layout beside it, saved on
 * its own whenever the positions change.
 *
 * Each course opens in a tab of its own (store/docs.ts); a file already open
 * is shown, not opened twice.
 */
import { isTauri, native, pickOpen, pickSave, alertDialog } from "./platform";
import { buildPlayer, titleOf } from "./export";
import { askUnsaved } from "../ui/dialogs";
import { isDirty, useEditor, type DocSlice } from "../store/editor";
import { activateDoc, dirtyDocs, docState, docWithPath, dropDoc, flushPending, onLeave, openDoc, patchDoc } from "../store/docs";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { layoutPathFor, parseLayout } from "../store/layout";
import { detectStyle, stringify, syntaxErrorAt } from "../course/serialize";
import { newCourse } from "../course/factory";
import { t } from "../i18n";
import { errorText } from "../i18n/errors";
import type { Course } from "../schema/types";

/** What a tab, the toolbar and the window call a course: its file's name, or its title until it has a file. */
export const docLabel = (doc: Pick<DocSlice, "path" | "course">): string =>
  doc.path ? doc.path.split("/").pop()! : (doc.course ? titleOf(doc.course, "").trim() : "") || t("file.untitled");

export const windowTitle = () => {
  const s = useEditor.getState();
  return s.course ? `${isDirty(s) ? "• " : ""}${docLabel(s)} — Edukors Graph Editor` : "Edukors Graph Editor";
};

/** Asks what to do with the unsaved changes of an open course. True when it is fine to go on. */
export async function settleUnsaved(id = useEditor.getState().docId): Promise<boolean> {
  flushPending();
  const doc = id ? docState(id) : undefined;
  if (!doc || !isDirty(doc)) return true;
  const choice = await askUnsaved(docLabel(doc));
  if (choice === "cancel") return false;
  if (choice === "save") return saveCourse(false, id);
  return true;
}

/** Before the window closes: each course with unsaved changes comes on screen in turn and is asked about. */
export async function settleAll(): Promise<boolean> {
  flushPending();
  for (const id of dirtyDocs()) {
    activateDoc(id);
    if (!(await settleUnsaved(id))) return false;
  }
  return true;
}

/** Closes a tab, asking first when its course has unsaved changes (shown, so the question is about what is seen). */
export async function closeDoc(id = useEditor.getState().docId): Promise<boolean> {
  if (!id) return false;
  const doc = docState(id);
  if (doc && isDirty(doc)) activateDoc(id);
  if (!(await settleUnsaved(id))) return false;
  dropDoc(id);
  return true;
}

export function createCourse() {
  const lang = usePrefs.getState().uiLang;
  // Nothing in it is the author's yet: closing it untouched asks nothing.
  openDoc(newCourse(lang, t("file.newTitle")), { path: null, saved: true });
}

/** One of the samples, in a tab of its own. */
export function openSample(raw: string) {
  openDoc(JSON.parse(raw), { path: null, style: detectStyle(raw), saved: true });
  useEditor.getState().requestLayout();
}

const opening = new Set<string>();

export async function openCourse(path?: string): Promise<void> {
  const target = path ?? (await pickOpen());
  if (!target) return;
  const open = docWithPath(target);
  if (open) return activateDoc(open);
  if (opening.has(target)) return;
  opening.add(target);
  try {
    await readCourse(target);
  } finally {
    opening.delete(target);
  }
}

async function readCourse(target: string) {
  let raw: string;
  try {
    raw = await native.readText(target);
  } catch (e) {
    await alertDialog(errorText(e), t("file.openFailed"));
    return;
  }
  let course: Course;
  try {
    course = JSON.parse(raw);
  } catch {
    const at = syntaxErrorAt(raw);
    await alertDialog(at ? `${t("file.notJson")}\n${t("json.at", at)}` : t("file.notJson"), t("file.openFailed"));
    return;
  }
  if (!course || typeof course !== "object" || !("nodes" in course)) {
    await alertDialog(t("file.notCourse"), t("file.openFailed"));
    return;
  }
  const layoutPath = layoutPathFor(target);
  let layoutRaw: string | null = null;
  if (isTauri() && (await native.fileExists(layoutPath))) layoutRaw = await native.readText(layoutPath).catch(() => null);
  const layout = parseLayout(layoutRaw);
  openDoc(course, { path: target, style: detectStyle(raw), saved: true, layout });
  // A course opened from a file starts on the whole map, the side panel closed.
  useUi.setState({ inspector: false });
  const positioned = Array.isArray(course.nodes) && course.nodes.every((n) => layout.positions[n?.id]);
  if (!positioned) useEditor.getState().requestLayout();
  await usePrefs.getState().addRecent(target);
}

/** Saves an open course, the one on screen unless told which. */
export async function saveCourse(saveAs: boolean, id = useEditor.getState().docId): Promise<boolean> {
  const doc = id ? docState(id) : undefined;
  if (!doc?.course) return false;
  const { course, style, layout } = doc;
  let path = doc.path;
  if (!path || saveAs) {
    const suggested = path ?? `${slug(titleOf(course, "course"))}-course.json`;
    path = await pickSave(suggested);
    if (!path) return false;
  }
  const text = stringify(course, style);
  const layoutText = JSON.stringify(layout, null, 2) + "\n";
  try {
    await native.writeText(path, text);
    if (isTauri()) await native.writeText(layoutPathFor(path), layoutText);
  } catch (e) {
    await alertDialog(errorText(e), t("file.saveFailed"));
    return false;
  }
  // What was written, not what the course may have become meanwhile.
  patchDoc(id, { path, savedCourse: course, savedLayout: layoutText });
  await usePrefs.getState().addRecent(path);
  return true;
}

let layoutTimer: ReturnType<typeof setTimeout> | undefined;

/** Writes the layout of the course on screen, when it differs from the file's. */
async function writeLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = undefined;
  const { docId, path, layout, savedLayout } = useEditor.getState();
  if (!path || !isTauri()) return;
  const text = JSON.stringify(layout, null, 2) + "\n";
  if (text === savedLayout) return;
  try {
    await native.writeText(layoutPathFor(path), text);
    patchDoc(docId, { savedLayout: text });
  } catch {
    /* the next change tries again */
  }
}

/** Saves the layout on its own, a moment after it last changed (plan 5.8), or at once when its course leaves the screen. */
export function watchLayout() {
  const stopLeave = onLeave(() => {
    if (layoutTimer !== undefined) void writeLayout();
  });
  const stop = useEditor.subscribe((s, prev) => {
    if (s.layout === prev.layout || s.docId !== prev.docId || !s.path || !isTauri()) return;
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(writeLayout, 1000);
  });
  return () => {
    stop();
    stopLeave();
  };
}

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "course";

const baseName = () => {
  const s = useEditor.getState();
  if (s.path) return s.path.replace(/(-course)?\.json$/i, "");
  return slug(titleOf(s.course!, "course"));
};

export async function exportPlayer(): Promise<void> {
  const course = useEditor.getState().course;
  if (!course) return;
  const path = await pickSave(`${baseName()}-player.html`, [{ name: "HTML", extensions: ["html"] }]);
  if (!path) return;
  await native.writeText(path, buildPlayer(course)).catch((e) => alertDialog(errorText(e), t("file.saveFailed")));
}
