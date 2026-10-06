import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A help mark whose tooltip is a description from the schema. */
export const Help = ({ text }: { text?: string }) =>
  text ? (
    <span className="help" title={text} aria-label={text} tabIndex={0} role="note">
      ?
    </span>
  ) : null;

export const Field = ({
  label,
  help,
  children,
  hint,
  error,
  actions,
}: {
  label: ReactNode;
  help?: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** buttons at the right end of the label's line */
  actions?: ReactNode;
}) => (
  <div className="field">
    <div className="field-label">
      <span>{label}</span>
      <Help text={help} />
      {actions && <span className="field-actions">{actions}</span>}
    </div>
    {children}
    {hint && <div className="field-hint">{hint}</div>}
    {error && <div className="field-error">{error}</div>}
  </div>
);

/** A textarea that grows with its text. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; innerRef?: React.Ref<HTMLTextAreaElement> }) {
  const { minRows = 2, innerRef, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(600, el.scrollHeight + 2)}px`;
  }, [props.value]);
  return (
    <textarea
      {...rest}
      rows={minRows}
      ref={(el) => {
        ref.current = el;
        if (typeof innerRef === "function") innerRef(el);
        else if (innerRef) (innerRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      }}
      className={`input textarea ${rest.className ?? ""}`}
    />
  );
}

/** A text input that commits on every keystroke but keeps a local value while focused (no caret jumps). */
export function TextInput({
  value,
  onChange,
  pattern,
  ...rest
}: { value: string; onChange: (v: string) => void; pattern?: RegExp } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "pattern">) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  const invalid = pattern && local !== "" && !pattern.test(local);
  return (
    <input
      {...rest}
      className={`input ${invalid ? "is-invalid" : ""} ${rest.className ?? ""}`}
      value={local}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setLocal(value);
      }}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  ...rest
}: { value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "min" | "max" | "step"
>) {
  const [local, setLocal] = useState(value === undefined ? "" : String(value));
  useEffect(() => setLocal(value === undefined ? "" : String(value)), [value]);
  return (
    <input
      {...rest}
      type="number"
      className={`input input-number ${rest.className ?? ""}`}
      value={local}
      min={min}
      max={max}
      step={step ?? "any"}
      placeholder={placeholder}
      onChange={(e) => {
        setLocal(e.target.value);
        if (e.target.value === "") onChange(undefined);
        else if (!Number.isNaN(Number(e.target.value))) onChange(Number(e.target.value));
      }}
    />
  );
}

export const Tabs = <T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode; title?: string; mark?: "empty" | "error" | "outdated" }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) => (
  <div className={`tabs ${className ?? ""}`} role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        role="tab"
        aria-selected={tab.id === value}
        title={tab.title}
        className={`tab ${tab.id === value ? "is-active" : ""} ${tab.mark ? `mark-${tab.mark}` : ""}`}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export const IconButton = ({ title, children, ...rest }: { title: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" {...rest} title={title} aria-label={title} className={`icon-btn ${rest.className ?? ""}`}>
    {children}
  </button>
);

export function Modal({
  title,
  onClose,
  children,
  wide,
  actions,
  dismissable = true,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean | "full";
  actions?: ReactNode;
  /** false: no ×, and neither Esc nor a click outside closes it; only its actions do */
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!dismissable) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dismissable]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide === "full" ? "modal-full" : wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          {dismissable && (
            <IconButton title="×" onClick={onClose} className="modal-close">
              ×
            </IconButton>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export const Section = ({ title, children, actions, open = true }: { title: ReactNode; children: ReactNode; actions?: ReactNode; open?: boolean }) => {
  const [isOpen, setOpen] = useState(open);
  return (
    <section className={`insp-section ${isOpen ? "" : "is-closed"}`}>
      <header>
        <button className="insp-toggle" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen}>
          <span className="chevron">{isOpen ? "▾" : "▸"}</span> {title}
        </button>
        <div className="insp-actions">{actions}</div>
      </header>
      {isOpen && <div className="insp-body">{children}</div>}
    </section>
  );
};
