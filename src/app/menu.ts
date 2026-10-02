/**
 * The native menu, rebuilt from what it shows: the interface language and the
 * recent files (the preferences), and the languages the map's titles can be
 * read in, as the toolbar's globe lists them (the course on screen).
 */
import { courseLangs, useEditor } from "../store/editor";
import { usePrefs } from "../store/prefs";
import { native } from "./platform";

let last = "";

/** Sends the menu to the app when what it shows has changed, or always with force (a check item clicked checks itself). */
export function syncMenu(force = false) {
  const { uiLang, recent, loaded } = usePrefs.getState();
  // Before the preferences, the menu the app was built with stands.
  if (!loaded) return;
  const { course, canvasLang } = useEditor.getState();
  const map = { langs: course ? courseLangs(course) : [], current: canvasLang };
  const key = JSON.stringify([uiLang, recent, map]);
  if (key === last && !force) return;
  last = key;
  native.setMenu(uiLang, recent, map).catch(() => undefined);
}

/** Keeps the map's languages in the menu as courses and tabs change; returns the unsubscribe. */
export const watchMenu = () => useEditor.subscribe(() => syncMenu());
