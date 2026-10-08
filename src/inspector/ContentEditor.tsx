/**
 * The full-screen editor of a node's content (Markdown or HTML) or of a
 * dynamic node's prompt (Markdown, with {{STORAGE: key}}), opened by the
 * inspector's ✎: the text as written (Raw) or as it reads (View), a toolbar
 * with the commands that matter most, and long lines broken at the edge or
 * kept whole. What is typed goes into the course at once, as in the inspector,
 * so closing never loses anything, and ⌘Z undoes it.
 *
 * The AI agent opens beside the text (the ✦ in the title bar, ⇧⌘A), so it can
 * work on the text being written: what it changes appears in the box at once,
 * since both read the course. It is the panel of App.tsx, which gives it up
 * while the editor is open.
 */
import { useEffect, useRef, useState } from "react";
import { courseLangs, useEditor } from "../store/editor";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { getText } from "../i18n/texts";
import { localize } from "../course/localize";
import { commandKey, keyLabel } from "../app/os";
import { isDialogOpen } from "../ui/dialogs";
import { IconButton, Tabs } from "../ui/controls";
import { AiIcon, BoldIcon, HeadingIcon, ImageIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, ParagraphIcon, WrapIcon } from "../ui/icons";
import { AgentPanel } from "../agent/AgentPanel";
import { RichPreview, StorageKeySelect, useStorageCompletion, writeText } from "./fields";
import { applyMarkup, COMMANDS, storageRef, type MarkupCommand, type TextEdit } from "./markup";
import { t } from "../i18n";

type Mode = "raw" | "view";

const ICONS: Record<MarkupCommand, typeof BoldIcon> = {
  heading: HeadingIcon,
  paragraph: ParagraphIcon,
  bold: BoldIcon,
  italic: ItalicIcon,
  ul: ListIcon,
  ol: ListOrderedIcon,
  link: LinkIcon,
  image: ImageIcon,
};

/** Where the toolbar's groups begin: titles, emphasis, lists, references. */
const GROUP_STARTS = new Set<MarkupCommand>(["bold", "ul", "link"]);

/** ⌘B, ⌘I and ⌘K, as in most editors. */
const KEYS: Record<string, MarkupCommand> = { b: "bold", i: "italic", k: "link" };

/** The list of keys: its width, and the height it may take (.autocomplete). */
const MENU = { width: 360, height: 240 };

/** Pressed without taking the focus, so the selection in the text stays. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** Whether a key was pressed inside the agent beside the text, which has its own Esc. */
const inAgent = (target: EventTarget | null) => !!(target as Element | null)?.closest?.(".agent-panel");

/**
 * Where the character at `index` is drawn in a text box, in pixels from the
 * box's top left corner as it is scrolled, and the height of a line: a hidden
 * copy of the box, laid out as the box lays out its text, is measured.
 */
function caretPoint(el: HTMLTextAreaElement, index: number) {
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const p of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "tabSize", "textTransform", "wordSpacing", "whiteSpace", "overflowWrap", "wordBreak", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const)
    mirror.style[p] = style[p];
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", top: "0", left: "0", boxSizing: "border-box", width: `${el.clientWidth}px`, border: "0", overflow: "hidden" });
  mirror.textContent = el.value.slice(0, index);
  const mark = mirror.appendChild(document.createElement("span"));
  mark.textContent = el.value.slice(index) || ".";
  document.body.appendChild(mirror);
  const point = { left: mark.offsetLeft - el.scrollLeft, top: mark.offsetTop - el.scrollTop, line: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 };
  mirror.remove();
  return point;
}

export function ContentEditor() {
  const target = useUi((s) => s.content);
  const close = useUi((s) => s.close);
  const agent = useUi((s) => s.agent);
  const course = useEditor((s) => s.course);
  const canvasLang = useEditor((s) => s.canvasLang);
  const wrap = usePrefs((s) => s.editorWrap);
  const [mode, setMode] = useState<Mode>("raw");
  const [lang, setLang] = useState(target?.lang ?? "");
  // where the list of keys opens, under the "{{" being typed
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  // The agent that was already open when the editor opened only moves here: the text keeps the focus.
  const [agentWasOpen] = useState(agent);
  const list = course && target ? getText(course, target.path) : undefined;
  const path = target?.path ?? "";
  const langs = course ? courseLangs(course) : [];
  const source = langs[0];
  const active = langs.includes(lang) ? lang : source;

  /** Puts `text` in place of a part of the text, through the box's own history (⌘Z undoes it like typing), and selects `select`. */
  const apply = ({ from, to, text, select }: TextEdit) => {
    const el = box.current;
    if (!el) return;
    el.focus();
    if (el.value.slice(from, to) !== text) {
      el.setSelectionRange(from, to);
      const done = text ? document.execCommand("insertText", false, text) : document.execCommand("delete");
      if (!done) writeText(path, active, el.value.slice(0, from) + text + el.value.slice(to));
    }
    requestAnimationFrame(() => box.current?.setSelectionRange(select[0], select[1]));
  };
  const insert = (from: number, to: number, text: string) => apply({ from, to, text, select: [from + text.length, from + text.length] });
  const completion = useStorageCompletion(box, target?.node, insert);

  // Esc closes, wherever the focus is, unless something nearer took it (the list of keys, a dialog
  // above, the agent beside the text, where Esc is the composer's).
  // Outside the text, ⌫ does nothing: the map behind keeps its selection, and WebKit does not go back a page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // While an input method is composing (Chinese, Japanese…), Esc is the composition's.
      if (e.key === "Escape" && !e.isComposing && !isDialogOpen() && !inAgent(e.target)) close();
      else if (e.key === "Backspace" && !(e.target as Element | null)?.closest?.("textarea, input, select")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // The language on screen travels with the agent's context: it works on the text the person is reading.
  useEffect(() => {
    if (active) useUi.getState().setContentLang(active);
  }, [active]);

  // The text is gone (its node deleted or renamed, an undo past its creation): nothing left to edit.
  useEffect(() => {
    if (!list) close();
  }, [list, close]);

  if (!course || !target || !list) return null;
  const { kind } = target;
  const prompt = kind === "prompt";
  // A prompt is written in Markdown.
  const markup = kind === "html" ? "html" : "markdown";
  const textOf = (l: string) => list.find((e) => e?.lang === l)?.text ?? "";
  const value = textOf(active);
  const node = target.node ? course.nodes.find((n) => n.id === target.node) : undefined;

  const run = (command: MarkupCommand) => {
    const el = box.current;
    if (el) apply(applyMarkup(markup, command, el.value, el.selectionStart, el.selectionEnd));
  };

  /** Opens the list of keys under a "{{" being typed, placed so that it stays inside the box. */
  const complete = (el: HTMLTextAreaElement) => {
    const query = completion.detect(el);
    if (!query) return setAnchor(null);
    const at = caretPoint(el, query.start);
    const below = at.top + at.line + 2;
    setAnchor({
      left: Math.max(0, Math.min(at.left, el.clientWidth - MENU.width - 8)),
      top: below + MENU.height > el.clientHeight ? Math.max(0, at.top - MENU.height - 2) : below,
    });
  };

  // A prompt usually exists in one language only: an empty one is no news, and the others are no model for it.
  const placeholder = prompt ? (active === source ? t("loc.promptPlaceholder") : t("loc.optionalLang")) : active === source ? t(`content.placeholder.${kind}`) : textOf(source);

  const raw = mode === "raw";
  return (
    <div className="content-editor" role="dialog" aria-modal="true" aria-label={`${target.label} ${node?.id ?? ""}`}>
      <div className="ce-pane">
        <header className="ce-head">
          <h2>{target.label}</h2>
          {node && (
            <span className="ce-node">
              <code>{node.id}</code> {localize(node.title, canvasLang)}
            </span>
          )}
          <span className="ce-kind">{markup === "html" ? "HTML" : "Markdown"}</span>
          <span className="spacer" />
          {langs.length > 1 && (
            <select className="input input-small" value={active} onChange={(e) => setLang(e.target.value)} aria-label={t("content.lang")}>
              {langs.map((l) => (
                <option key={l} value={l}>
                  {l === source ? `${l} ★` : l}
                  {prompt || textOf(l).trim() ? "" : ` (${t("content.emptyLang")})`}
                </option>
              ))}
            </select>
          )}
          <IconButton
            title={`${t("agent.title")} (${keyLabel("⇧⌘A")})`}
            className={`ce-agent ${agent ? "is-on" : ""}`}
            aria-pressed={agent}
            onClick={() => useUi.getState().toggleAgent()}
          >
            <AiIcon size={17} />
          </IconButton>
          <button className="btn btn-primary" onClick={close}>
            {t("content.done")}
          </button>
        </header>
        <div className="ce-bar">
          <Tabs<Mode>
            value={mode}
            onChange={setMode}
            tabs={[
              { id: "raw", label: t("content.raw") },
              { id: "view", label: t("content.view") },
            ]}
          />
          <div className="ce-tools" role="toolbar" aria-label={t("content.toolbar")}>
            {COMMANDS[markup].map((command) => {
              const Icon = ICONS[command];
              return (
                <span key={command} className="ce-tool">
                  {GROUP_STARTS.has(command) && <span className="ce-sep" />}
                  <IconButton title={t(`content.${command}`)} disabled={!raw} onMouseDown={keepFocus} onClick={() => run(command)}>
                    <Icon size={17} />
                  </IconButton>
                </span>
              );
            })}
            {prompt && (
              <span className="ce-tool">
                <span className="ce-sep" />
                <StorageKeySelect
                  keys={completion.keys}
                  disabled={!raw}
                  onPick={(key) => {
                    const el = box.current;
                    if (el) insert(el.selectionStart, el.selectionEnd, storageRef(key));
                  }}
                />
              </span>
            )}
            <IconButton
              title={t("content.wrap")}
              aria-pressed={wrap}
              className={`ce-wrap ${wrap ? "is-on" : ""}`}
              disabled={!raw}
              onMouseDown={keepFocus}
              onClick={() => void usePrefs.getState().save({ editorWrap: !wrap })}
            >
              <WrapIcon size={17} />
            </IconButton>
          </div>
        </div>
        <div className="ce-body">
          {raw ? (
            <textarea
              // One per language: each keeps its own history of ⌘Z.
              key={active}
              ref={box}
              className={`ce-text ${wrap ? "" : "is-nowrap"}`}
              value={value}
              wrap={wrap ? "soft" : "off"}
              spellCheck={kind !== "html"}
              autoFocus
              placeholder={placeholder}
              onChange={(e) => {
                writeText(path, active, e.target.value);
                if (prompt) complete(e.target);
              }}
              onKeyDown={(e) => {
                if (prompt && completion.onKeyDown(e)) return;
                const command = commandKey(e) && !e.altKey && !e.shiftKey ? KEYS[e.key.toLowerCase()] : undefined;
                if (!command) return;
                e.preventDefault();
                run(command);
              }}
              onBlur={prompt ? () => setTimeout(completion.close, 150) : undefined}
              onScroll={prompt ? completion.close : undefined}
            />
          ) : (
            <RichPreview kind={markup} text={value} className="ce-view" />
          )}
          {raw && anchor && completion.menu({ left: anchor.left, top: anchor.top, width: MENU.width }, "ce-complete")}
        </div>
      </div>
      {agent && <AgentPanel focus={!agentWasOpen} />}
    </div>
  );
}
