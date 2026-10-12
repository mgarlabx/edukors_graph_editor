/**
 * The JSON editor of a part's `extras`, opened by the ✎ of its box in the
 * inspector: Monaco, the text checked as it is typed. Nothing goes into the
 * course until Apply (⌘↵), as one undo step; an empty text, or {}, takes the
 * extras away. While something typed is not applied, only Cancel closes it,
 * so a stray Esc or click outside never loses it.
 *
 * Loaded on demand, like the JSON tab, so Monaco stays out of the first load.
 */
import { useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { isDark, monaco } from "../json/monaco";
import { trackEditor } from "../json/ref";
import { useEditor } from "../store/editor";
import { stringify } from "../course/serialize";
import { parseExtras } from "../course/extras";
import { keyLabel } from "../app/os";
import { Modal } from "../ui/controls";
import type { Extras } from "../schema/types";
import { t } from "../i18n";

export default function ExtrasEditor({
  value,
  owner,
  title,
  onApply,
  onClose,
}: {
  /** what the part has now; anything, as a course read from a file may hold anything there */
  value: unknown;
  /** whose extras, unique in the course ("info", a node's id…): the editor's model is named after it */
  owner: string;
  title: string;
  onApply: (next: Extras | undefined) => void;
  onClose: () => void;
}) {
  const style = useEditor((s) => s.style);
  const docId = useEditor((s) => s.docId);
  const indent = style.indent || "  ";
  const initial = useRef(value === undefined ? `{\n${indent}\n}` : stringify(value, { ...style, trailingNewline: false })).current;
  const [text, setText] = useState(initial);
  const parsed = parseExtras(text);
  const dirty = text !== initial;

  const apply = () => {
    if (!parsed.ok) return;
    if (dirty) onApply(parsed.value);
    onClose();
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const onMount: OnMount = (editor) => {
    editor.onDidDispose(trackEditor(editor));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => applyRef.current());
    // A new one: the cursor where the first key goes.
    if (value === undefined) editor.setPosition({ lineNumber: 2, column: indent.length + 1 });
    editor.focus();
  };

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      dismissable={!dirty}
      actions={
        <>
          <span className={`extras-status small ${parsed.ok ? "muted" : "is-error"}`}>
            {!parsed.ok ? `${t("extras.invalid")}: ${parsed.error}` : parsed.value === undefined ? t("extras.willRemove") : t("extras.hint")}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" disabled={!parsed.ok} onClick={apply} title={keyLabel("⌘↵")}>
            {t("extras.apply")}
          </button>
        </>
      }
    >
      {/* nokey: the canvas behind takes none of the keys typed here */}
      <div className="extras-editor nokey">
        <Editor
          defaultLanguage="json"
          defaultValue={initial}
          path={`${docId ?? "course"}/${owner}/extras.json`}
          theme={isDark() ? "vs-dark" : "vs"}
          onMount={onMount}
          onChange={(v) => setText(v ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            tabSize: indent.length || 2,
            insertSpaces: !indent.includes("\t"),
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            lineNumbersMinChars: 3,
          }}
        />
      </div>
    </Modal>
  );
}
