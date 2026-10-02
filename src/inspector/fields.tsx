/**
 * The fields every node form is built from: a localized text with one tab per
 * course language (source first, empty ones marked, two side by side in
 * "compare" mode), and a prompt box that completes {{STORAGE: key}}.
 */
import { useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { courseLangs, useEditor } from "../store/editor";
import { getText, setText, type TextKind } from "../i18n/texts";
import { withText } from "../course/localize";
import { keysOfCourse, scaleLabel } from "../course/keys";
import { AutoTextarea, Field, IconButton, Tabs } from "../ui/controls";
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

interface LocalizedProps {
  path: string;
  label: string;
  help?: string;
  kind: TextKind;
  optional?: boolean;
  minRows?: number;
  /** the node whose own keys {{STORAGE}} should not offer */
  owner?: string;
}

export function LocalizedField({ path, label, help, kind, optional, minRows, owner }: LocalizedProps) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const langs = courseLangs(course);
  const source = langs[0];
  const list = getText(course, path);
  const [lang, setLang] = useState(source);
  const [compare, setCompare] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const active = langs.includes(lang) ? lang : source;

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
  const write = (l: string, value: string) =>
    update((c) => setText(c, path, withText(getText(c, path) as Loc, l, value, langs)), `text:${path}:${l}`);

  const tabs = langs.map((l) => ({
    id: l,
    label: l === source ? `${l} ★` : l,
    title: l === source ? t("lang.source") : undefined,
    mark: (kind === "prompt" ? undefined : text(l).trim() === "" ? "empty" : undefined) as "empty" | undefined,
  }));

  const editor = (l: string) => (
    <LangEditor
      key={l}
      sourceText={text(source)}
      isSource={l === source}
      value={text(l)}
      onChange={(v) => write(l, v)}
      kind={kind}
      minRows={minRows}
      owner={owner}
      preview={preview}
    />
  );

  return (
    <Field
      label={label}
      help={help}
      hint={
        <div className="loc-tools">
          {langs.length > 1 && (
            <button className={`link ${compare ? "is-on" : ""}`} onClick={() => setCompare(compare ? null : (langs.find((l) => l !== active) ?? null))}>
              {t("loc.compare")}
            </button>
          )}
          {kind !== "plain" && kind !== "inline" && kind !== "prompt" && (
            <button className={`link ${preview ? "is-on" : ""}`} onClick={() => setPreview(!preview)}>
              {t("loc.preview")}
            </button>
          )}
          {optional && (
            <button className="link danger" onClick={() => update((c) => removeAt(c, path), "remove-field")}>
              {t("insp.remove")}
            </button>
          )}
        </div>
      }
    >
      {compare ? (
        <div className="compare">
          <div>
            <select className="input input-small" value={active} onChange={(e) => setLang(e.target.value)}>
              {langs.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            {editor(active)}
          </div>
          <div>
            <select className="input input-small" value={compare} onChange={(e) => setCompare(e.target.value)}>
              {langs.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            {editor(compare)}
          </div>
        </div>
      ) : (
        <>
          {langs.length > 1 && <Tabs tabs={tabs} value={active} onChange={setLang} className="tabs-small" />}
          {editor(active)}
        </>
      )}
    </Field>
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
  preview: boolean;
}) {
  const { value, sourceText, isSource, onChange, kind, minRows, owner, preview } = props;
  const single = kind === "plain" || kind === "inline";
  return (
    <div className="lang-editor">
      {preview ? (
        <RichPreview kind={kind} text={value} />
      ) : kind === "prompt" ? (
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

export function RichPreview({ kind, text }: { kind: TextKind; text: string }) {
  const html = useMemo(() => (kind === "html" ? text : DOMPurify.sanitize(String(marked.parse(text ?? "", { async: false })))), [kind, text]);
  if (kind === "html")
    return <iframe className="html-preview" sandbox="allow-scripts" srcDoc={html} title="preview" />;
  return <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

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
  const course = useEditor((s) => s.course)!;
  const lang = useEditor((s) => s.canvasLang);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const keys = useMemo(() => keysOfCourse(course, lang).filter((k) => k.node !== owner), [course, lang, owner]);
  const matches = query ? keys.filter((k) => k.key.toLowerCase().includes(query.text.toLowerCase())).slice(0, 12) : [];

  const detect = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const m = /\{\{\s*(?:S(?:T(?:O(?:R(?:A(?:G(?:E(?::\s*)?)?)?)?)?)?)?)?([a-z0-9.-]*)$/i.exec(before);
    if (m) {
      setQuery({ start: before.length - m[0].length, text: m[1] ?? "" });
      setActive(0);
    } else setQuery(null);
  };

  const insert = (key: string) => {
    const el = ref.current;
    if (!el || !query) return;
    const end = el.selectionStart;
    const next = `${value.slice(0, query.start)}{{STORAGE: ${key}}}${value.slice(end)}`;
    onChange(next);
    setQuery(null);
    const caret = query.start + `{{STORAGE: ${key}}}`.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

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
          detect(e.target);
        }}
        onKeyDown={(e) => {
          if (!query || !matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insert(matches[active].key);
          } else if (e.key === "Escape") setQuery(null);
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {query && matches.length > 0 && (
        <div className="autocomplete" role="listbox">
          {matches.map((k, i) => (
            <button
              key={k.key}
              role="option"
              aria-selected={i === active}
              className={`autocomplete-item ${i === active ? "is-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(k.key);
              }}
            >
              <code>{k.key}</code>
              <span className="muted">{scaleLabel(k)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="storage-insert">
        <select
          className="input input-small"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            const el = ref.current;
            const at = el?.selectionStart ?? value.length;
            onChange(`${value.slice(0, at)}{{STORAGE: ${e.target.value}}}${value.slice(at)}`);
          }}
          aria-label={t("prompt.insertKey")}
        >
          <option value="">{t("prompt.insertKey")}</option>
          {keys.map((k) => (
            <option key={k.key} value={k.key}>
              {k.key} ({scaleLabel(k)})
            </option>
          ))}
        </select>
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
