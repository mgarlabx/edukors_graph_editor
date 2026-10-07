/**
 * The native menu, rebuilt from what it shows: the interface language and the
 * recent files (the preferences), the languages the map's titles can be read
 * in, as the toolbar's globe lists them (the course on screen), whether a
 * course is open at all, and in how many tabs, and whether a dialog is open,
 * whose text fields take undo, the clipboard and select all.
 */
import { courseLangs, useEditor } from "../store/editor";
import { useDocs } from "../store/docs";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { isDialogOpen, watchDialogs } from "../ui/dialogs";
import { native } from "./platform";

/**
 * The commands that act on the course on screen, and every "insert:" with
 * them: off in the menu while no course is open, and ignored by command() then.
 * The app keeps the same list (NEEDS_COURSE in src-tauri/src/lib.rs).
 */
export const NEEDS_COURSE = [
  "close-tab", "save", "save-as", "export-player", "duplicate", "delete", "fit", "layout",
  "tab-canvas", "tab-json", "tab-preview", "problems", "agent", "sidebar",
];

export const needsCourse = (id: string) => NEEDS_COURSE.includes(id) || id.startsWith("insert:");

let last = "";

/** Sends the menu to the app when what it shows has changed, or always with force (a check item clicked checks itself). */
export function syncMenu(force = false) {
  const { uiLang, recent, loaded } = usePrefs.getState();
  // Before the preferences, the menu the app was built with stands.
  if (!loaded) return;
  const { course, canvasLang } = useEditor.getState();
  const map = { langs: course ? courseLangs(course) : [], current: canvasLang };
  const state = { course: !!course, tabs: useDocs.getState().order.length, dialog: useUi.getState().modal !== null || isDialogOpen() };
  const key = JSON.stringify([uiLang, recent, map, state]);
  if (key === last && !force) return;
  last = key;
  native.setMenu(uiLang, recent, map, state).catch(() => undefined);
}

/** Keeps the menu in step as courses, tabs and dialogs open, close and change; returns the unsubscribe. */
export const watchMenu = () => {
  const sync = () => syncMenu();
  const stops = [useEditor.subscribe(sync), useDocs.subscribe(sync), useUi.subscribe(sync), watchDialogs(sync)];
  return () => stops.forEach((stop) => stop());
};
