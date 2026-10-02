import type { editor } from "monaco-editor";

/** The JSON tab's editor, for the native menu's undo and redo; null until the tab first opens. */
export const jsonEditor: { current: editor.IStandaloneCodeEditor | null } = { current: null };
