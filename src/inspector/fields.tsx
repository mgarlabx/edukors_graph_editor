/**
 * The fields every node form is built from: a localized text, shown and written
 * in the language chosen at the inspector's head (the map's language), and a
 * prompt box that completes {{STORAGE: key}}. A node's content (Markdown or HTML) and a dynamic
 * node's prompt are not typed here: the field shows them, and its ✎ opens the
 * full-screen editor (ContentEditor.tsx).
 */
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { courseLangs, useEditor } from "../store/editor";
import { useUi } from "../store/ui";
import { getText, setText, type TextKind } from "../i18n/texts";
import { withText } from "../course/localize";
import { keysOfCourse, scaleLabel, type KeyInfo } from "../course/keys";
import { openLink } from "../app/platform";
import { AutoTextarea, Field, IconButton } from "../ui/controls";
import { EditIcon } from "../ui/icons";
import { storageQuery, storageRef, type StorageQuery } from "./markup";
import { t } from "../i18n";
import type { Course, Loc } from "../schema/types";

const removeAt = (course: Course, path: string) => {
  const parts = path.split("/");
  const last = parts.pop()!;
  const holder = getHolder(course, parts);
  if (holder) delete holder[last];
};

const getHolder = (course: Course, parts: string[]): Record<string, unknown> | undefined => {
  const [first, ...rest] = parts;
  let cur: unknown = first.startsWith("node:") ? course.nodes.find((n) => n.id === first.slice(5)) : (course as unknown as Record<string, unknown>)[first];
  for (const p of rest) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return cur as Record<string, unknown> | undefined;
};

/** Writes one language of a localized text; quick repeats of the same field are one undo step. */
export const writeText = (path: string, lang: string, value: string) =>
  useEditor.getState().update((c) => setText(c, path, withText(getText(c, path) as Loc, lang, value, courseLangs(c))), `text:${path}:${lang}`);

interface LocalizedProps {
  path: string;
  label: string;
  help?: string;
  kind: TextKind;
  optional?: boolean;
  /** optional, and its box shown even while the course has no such text: typing in it adds it */
  open?: boolean;
  minRows?: number;
  /** the node whose own keys {{STORAGE}} should not offer */
  owner?: string;
  /** a node's content (kind markdown or html) or a prompt: shown here, written in the full-screen editor */
  fullEditor?: boolean;
}

export function LocalizedField({ path, label, help, kind, optional, open, minRows, owner, fullEditor }: LocalizedProps) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const langs = courseLangs(course);
  const source = langs[0];
  const found = getText(course, path);
  const list = found ?? (open ? [] : undefined);
  const shown = useEditor((s) => s.canvasLang);
  const active = langs.includes(shown) ? shown : source;

  if (!list) {
    if (!optional) return null;
    return (
      <Field label={label} help={help}>
        <button className="btn btn-small" onClick={() => update((c) => setText(c, path, [{ lang: source, text: "" }]), "add-field")}>
          + {t("insp.add", { what: label })}
        </button>
      </Field>
    );
  }

  const text = (l: string) => list.find((e) => e?.lang === l)?.text ?? "";

  const full = fullEditor && (kind === "markdown" || kind === "html" || kind === "prompt");
  const openEditor = () =>
    useUi.getState().openContent({
      path,
      kind: kind as "markdown" | "html" | "prompt",
      lang: active,
      label,
      node: path.startsWith("node:") ? path.slice(5).split("/")[0] : undefined,
    });

  const value = text(active);
  // which language the box holds, beside the label, when the course has more than one
  const langMark = langs.length > 1 && label && (
    <span className={`lang-mark ${active === source ? "" : "is-translation"}`} title={active === source ? t("lang.source") : undefined}>
      {active}
    </span>
  );

  return (
    <Field
      label={
        label && (
          <>
            {label} {langMark}
          </>
        )
      }
      help={help}
      actions={
        full && (
          <>
            <span className="peek-meta">
              {kind === "html" ? "HTML" : "Markdown"}
              {value.trim() && ` · ${t("insp.words", { n: words(value) })}`}
            </span>
            <IconButton title={t("content.edit")} onClick={openEditor}>
              <EditIcon size={15} />
            </IconButton>
          </>
        )
      }
      hint={
        optional &&
        found && (
          <button className="link danger" onClick={() => update((c) => removeAt(c, path), "remove-field")}>
            {t("insp.remove")}
          </button>
        )
      }
    >
      {full ? (
        <ContentPeek kind={kind} value={value} onOpen={openEditor} />
      ) : (
        <LangEditor
          key={active}
          sourceText={text(source)}
          isSource={active === source}
          value={value}
          onChange={(v) => writeText(path, active, v)}
          kind={kind}
          minRows={minRows}
          owner={owner}
        />
      )}
    </Field>
  );
}

/** The words of a text, markup aside: a count for the eye, not the student's. */
const words = (text: string) => text.replace(/<[^>]*>|[#*_>`[\]()!|-]/g, " ").split(/\s+/).filter(Boolean).length;

/**
 * A node's content or prompt as written, cut after a few lines; a click opens
 * it in the full-screen editor. An empty prompt is no warning: prompts usually
 * exist in one language only.
 */
function ContentPeek({ kind, value, onOpen }: { kind: TextKind; value: string; onOpen: () => void }) {
  const empty = !value.trim();
  const prompt = kind === "prompt";
  return (
    <div
      className={`content-peek ${kind === "html" || prompt ? "mono" : ""} ${empty ? (prompt ? "is-blank" : "is-empty") : ""}`}
      title={t("content.edit")}
      onClick={onOpen}
    >
      {/* cut inside the padding, so no half line shows under the last one */}
      <span className="content-peek-text">{empty ? t("content.empty") : value}</span>
    </div>
  );
}

function LangEditor(props: {
  value: string;
  sourceText: string;
  isSource: boolean;
  onChange: (v: string) => void;
  kind: TextKind;
  minRows?: number;
  owner?: string;
}) {
  const { value, sourceText, isSource, onChange, kind, minRows, owner } = props;
  const single = kind === "plain" || kind === "inline";
  return (
    <div className="lang-editor">
      {kind === "prompt" ? (
        <StorageTextarea value={value} onChange={onChange} minRows={minRows ?? 5} owner={owner} placeholder={isSource ? t("loc.promptPlaceholder") : t("loc.optionalLang")} />
      ) : single ? (
        <input className={`input wide ${value.trim() ? "" : "is-empty"}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={isSource ? "" : sourceText} />
      ) : (
        <AutoTextarea
          className={`${kind === "html" ? "mono" : ""} ${value.trim() ? "" : "is-empty"}`}
          value={value}
          minRows={minRows ?? 4}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSource ? "" : sourceText.slice(0, 300)}
          spellCheck={kind !== "html"}
        />
      )}
    </div>
  );
}

/** Markdown as the student reads it, or HTML in a sandbox. A link opens in the computer's browser: the editor's window never leaves the editor. */
export function RichPreview({ kind, text, className = "" }: { kind: TextKind; text: string; className?: string }) {
  const html = useMemo(() => (kind === "html" ? text : DOMPurify.sanitize(String(marked.parse(text ?? "", { async: false })))), [kind, text]);
  if (kind === "html") return <iframe className={`html-preview ${className}`} sandbox="allow-scripts" srcDoc={html} title="preview" />;
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    void openLink(a.getAttribute("href") ?? "");
  };
  return <div className={`md-preview ${className}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The keys the course produces, for {{STORAGE: key}}: all but those of `owner`, the node being written. */
export function useStorageKeys(owner?: string): KeyInfo[] {
  const course = useEditor((s) => s.course);
  const lang = useEditor((s) => s.canvasLang);
  return useMemo(() => (course ? keysOfCourse(course, lang).filter((k) => k.node !== owner) : []), [course, lang, owner]);
}

/**
 * The {{STORAGE: key}} completion of a text box: typing "{{" opens the list of
 * the keys that match what follows, ↑ ↓ choose, ↵ or ⇥ write the key, Esc
 * closes the list. `write` puts a text in place of a part of the box's text.
 */
export function useStorageCompletion(box: RefObject<HTMLTextAreaElement | null>, owner: string | undefined, write: (from: number, to: number, text: string) => void) {
  const keys = useStorageKeys(owner);
  const [query, setQuery] = useState<StorageQuery | null>(null);
  const [active, setActive] = useState(0);
  const matches = query ? keys.filter((k) => k.key.toLowerCase().includes(query.text.toLowerCase())).slice(0, 12) : [];
  const open = matches.length > 0;

  /** Reads what is before the caret: a "{{" being typed opens the list. */
  const detect = (el: HTMLTextAreaElement) => {
    const next = storageQuery(el.value.slice(0, el.selectionStart));
    setQuery(next);
    setActive(0);
    return next;
  };
  const pick = (key: string) => {
    const el = box.current;
    if (!el || !query) return;
    write(query.start, el.selectionStart, storageRef(key));
    setQuery(null);
  };
  /** The list's keys while it is open; true when the key pressed was the list's. */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return false;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % matches.length);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + matches.length) % matches.length);
    else if (e.key === "Enter" || e.key === "Tab") pick(matches[active].key);
    else if (e.key === "Escape") setQuery(null);
    else return false;
    e.preventDefault();
    return true;
  };
  const menu = (style?: CSSProperties, className = "") =>
    open && (
      <div className={`autocomplete ${className}`} role="listbox" style={style}>
        {matches.map((k, i) => (
          <button
            key={k.key}
            role="option"
            aria-selected={i === active}
            className={`autocomplete-item ${i === active ? "is-active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(k.key);
            }}
          >
            <code>{k.key}</code>
            <span className="muted">{scaleLabel(k)}</span>
          </button>
        ))}
      </div>
    );
  return { keys, open, detect, onKeyDown, menu, close: () => setQuery(null) };
}

/** "Insert {{STORAGE: …}}": every key the course produces; the one picked is written where the caret is. */
export const StorageKeySelect = ({ keys, onPick, disabled }: { keys: KeyInfo[]; onPick: (key: string) => void; disabled?: boolean }) => (
  <select className="input input-small" value="" disabled={disabled} onChange={(e) => e.target.value && onPick(e.target.value)} aria-label={t("prompt.insertKey")}>
    <option value="">{t("prompt.insertKey")}</option>
    {keys.map((k) => (
      <option key={k.key} value={k.key}>
        {k.key} ({scaleLabel(k)})
      </option>
    ))}
  </select>
);

/** A prompt box; typing "{{" offers every key the course produces. */
export function StorageTextarea({
  value,
  onChange,
  minRows = 3,
  owner,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
  owner?: string;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const completion = useStorageCompletion(ref, owner, (from, to, text) => {
    onChange(value.slice(0, from) + text + value.slice(to));
    const caret = from + text.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  });

  return (
    <div className="storage-box">
      <AutoTextarea
        innerRef={ref}
        className={`mono ${className ?? ""}`}
        value={value}
        minRows={minRows}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          completion.detect(e.target);
        }}
        onKeyDown={completion.onKeyDown}
        onBlur={() => setTimeout(completion.close, 150)}
      />
      {completion.menu()}
      <div className="storage-insert">
        <StorageKeySelect
          keys={completion.keys}
          onPick={(key) => {
            const at = ref.current?.selectionStart ?? value.length;
            onChange(value.slice(0, at) + storageRef(key) + value.slice(at));
          }}
        />
      </div>
    </div>
  );
}

/** A list editor's row buttons: up, down, remove. */
export const RowTools = ({ index, count, onMove, onRemove, removeLabel }: { index: number; count: number; onMove: (to: number) => void; onRemove?: () => void; removeLabel?: string }) => (
  <span className="row-tools">
    <IconButton title={t("common.up")} disabled={index === 0} onClick={() => onMove(index - 1)}>
      ↑
    </IconButton>
    <IconButton title={t("common.down")} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
      ↓
    </IconButton>
    {onRemove && (
      <IconButton title={removeLabel ?? t("insp.remove")} onClick={onRemove} className="danger">
        ×
      </IconButton>
    )}
  </span>
);

export const move = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};
