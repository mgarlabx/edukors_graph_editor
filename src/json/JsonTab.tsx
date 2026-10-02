/**
 * The course as JSON, in Monaco, kept in step with the canvas both ways
 * (plan 5.2 / phase 2). Typing that leaves valid JSON goes into the store as
 * one undo step a moment after the last key; typing that does not is held in
 * the editor, with the parse error shown, until it does. The embedded schema
 * gives completion and inline errors.
 *
 * Typing still waiting for that moment goes in before its course leaves the
 * screen, so it never lands in the course of another tab.
 */
import { useEffect, useRef, useState } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import schema from "../schema/schema.json";
import { useEditor } from "../store/editor";
import { onLeave } from "../store/docs";
import { stringify, syntaxErrorAt } from "../course/serialize";
import { t } from "../i18n";
import { jsonEditor } from "./ref";

self.MonacoEnvironment = {
  getWorker: (_: string, label: string) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
loader.config({ monaco });
monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  enableSchemaRequest: false,
  schemas: [{ uri: schema.$id, fileMatch: ["*"], schema }],
});

const dark = () =>
  document.documentElement.getAttribute("data-theme") === "dark" ||
  (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);

export default function JsonTab() {
  const course = useEditor((s) => s.course);
  const style = useEditor((s) => s.style);
  const docId = useEditor((s) => s.docId);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const lastPushed = useRef<unknown>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<string | null>(null);

  // The store changed (canvas, inspector, undo): show it, unless it is what we just typed.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !course || course === lastPushed.current) return;
    const text = stringify(course, style);
    if (editor.getValue() !== text) {
      const selection = editor.getSelection();
      editor.executeEdits("store", [{ range: editor.getModel()!.getFullModelRange(), text }]);
      if (selection) editor.setSelection(selection);
      setParseError(null);
    }
  }, [course, style]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    jsonEditor.current = editor;
  };

  /** What was typed, into the course; reads the store, not the render, as it may run on the way out. */
  const commit = useRef(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value === null) return;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("json.notObject"));
      setParseError(null);
      const { course: current, style: currentStyle, replace } = useEditor.getState();
      if (current && stringify(current, currentStyle) === value) return;
      lastPushed.current = parsed;
      replace(parsed, "json");
    } catch (e) {
      const at = e instanceof SyntaxError ? syntaxErrorAt(value) : null;
      setParseError(at ? t("json.at", at) : (e as Error).message);
    }
  }).current;

  useEffect(() => {
    const stop = onLeave(commit);
    return () => {
      stop();
      commit();
      if (jsonEditor.current === editorRef.current) jsonEditor.current = null;
    };
  }, [commit]);

  const onChange = (value: string | undefined) => {
    pending.current = value ?? "";
    clearTimeout(timer.current);
    timer.current = setTimeout(commit, 450);
  };

  if (!course) return null;
  return (
    <div className="json-tab">
      {parseError && <div className="notice notice-error json-error">{t("json.invalid")}: {parseError}</div>}
      <Editor
        defaultLanguage="json"
        defaultValue={stringify(course, style)}
        path={`${docId ?? "course"}/course.json`}
        theme={dark() ? "vs-dark" : "vs"}
        onMount={onMount}
        onChange={onChange}
        options={{
          minimap: { enabled: true },
          fontSize: 13,
          tabSize: style.indent.length || 2,
          insertSpaces: !style.indent.includes("\t"),
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          formatOnPaste: false,
        }}
      />
    </div>
  );
}
