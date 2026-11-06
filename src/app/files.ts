/**
 * What the editor does with course files besides Save and Open, which are Common's (src/common/document.ts): a
 * course's name, a new course, the samples, and the two exports -- the course as .egf for the player, the Moodle
 * plugin and the gallery, and the standalone player (HTML).
 *
 * Exports are not saves: they never write the course's .egrx or the .egf it came from (checked again in the main
 * process, src/main/files.ts).
 */
import { native } from "./platform";
import { baseName as fileName } from "./os";
import { buildPlayer, titleOf } from "./export";
import { useEditor, type DocSlice } from "../store/editor";
import { docState, openDoc } from "../store/docs";
import { detectStyle } from "../course/serialize";
import { exportEgf } from "../course/egrx";
import { newCourse } from "../course/factory";
import { getUiLang, t } from "../i18n";
import { errorText } from "../i18n/errors";

/** What a tab and the assistant call a course: its file's name, or its title until it has a file. */
export const docLabel = (doc: Pick<DocSlice, "path" | "course">): string =>
  doc.path ? fileName(doc.path) : (doc.course ? titleOf(doc.course, "").trim() : "") || t("file.untitled");

/** A new course, in a tab of its own; nothing in it is the author's yet. */
export const createCourse = () => openDoc(newCourse(getUiLang(), t("file.newTitle")), { path: null, saved: true });

/** One of the samples, in a tab of its own. */
export function openSample(raw: string) {
  const id = openDoc(JSON.parse(raw), { path: null, style: detectStyle(raw), saved: true });
  useEditor.getState().requestLayout();
  return id;
}

export const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "course";

/* eslint-disable @typescript-eslint/no-explicit-any */
const common: any = globalThis;
/** Common's interface texts (its export screen's), and the editor's own for the formats. */
const commonT = (key: string) => common.EdukorsLanguages?.[document.documentElement.lang]?.messages?.[key] ?? common.EdukorsLanguages?.en?.messages?.[key] ?? key;
let lastFormat = "egf";

/**
 * Export, on Common's export screen: the course as .egf (for the player, the Moodle plugin and the gallery: the course
 * as it is) or the standalone player (HTML). The file goes next to the course's .egrx, with its name; a course
 * without a file is saved first. `doc` is Common's tab of the course.
 */
export async function exportCourse(id: string, doc: { name?: string; folder?: string; path?: string }): Promise<void> {
  if (!(await common.EdukorsFiles.saveFirst(doc))) return;
  const formats = [
    { id: "egf", label: t("export.egf"), description: t("export.egfDesc"), extension: ".egf" },
    { id: "html", label: t("export.player"), description: t("export.playerDesc"), extension: ".html" },
  ];
  await common.EdukorsFileDialogs.exportAs({
    t: commonT,
    name: doc.name,
    folder: doc.folder,
    formats,
    format: lastFormat,
    commit: async ({ name, folder, format, replace, progress }: { name: string; folder: string; format: "egf" | "html"; replace?: boolean; progress: (n: number) => void }) => {
      const state = docState(id);
      if (!state?.course) return { error: t("file.saveFailed") };
      progress(20);
      try {
        const text = format === "egf" ? exportEgf({ course: state.course, style: state.style }) : buildPlayer(state.course);
        const written = await native.exportFile({ kind: format, name, folder, text, replace: !!replace, protect: [doc.path].filter((p): p is string => !!p) });
        if (written && "exists" in written) return { exists: true };
        progress(100);
        lastFormat = format;
        common.EdukorsFileDialogs.toast({ t: commonT, message: `${t("export.done")}: ${name}.${format}` });
        return {};
      } catch (e) {
        return { error: errorText(e) };
      }
    },
  });
}
