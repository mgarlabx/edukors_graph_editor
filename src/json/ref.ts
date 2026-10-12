import type { editor } from "monaco-editor";

/** The JSON tab's editor, for the native menu's undo and redo; null until the tab first opens. */
export const jsonEditor: { current: editor.IStandaloneCodeEditor | null } = { current: null };

/** Every Monaco editor on screen: the JSON tab's and the extras editor's. */
const editors = new Set<editor.IStandaloneCodeEditor>();

/** Counts an editor in until the returned function is called (on its disposal). */
export const trackEditor = (e: editor.IStandaloneCodeEditor) => {
  editors.add(e);
  return () => void editors.delete(e);
};

/** The Monaco editor that has the focus, for the native menu's undo and redo; else the JSON tab's. */
export const focusedEditor = () => [...editors].find((e) => e.hasTextFocus()) ?? jsonEditor.current;

