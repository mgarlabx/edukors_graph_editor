/**
 * Where the person writes, and the settings of the conversation below it:
 * whether the selection goes along, a file to attach, the mode, the model
 * and its effort (with the account and its usage), send or stop.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAgent, type Effort, type Mode } from "./store";
import { selectionLabel } from "./context";
import { Usage } from "./Usage";
import { useEditor } from "../store/editor";
import { isTauri, pickOpen } from "../app/platform";
import { t } from "../i18n";
import { BoltIcon, CheckIcon, ChevronDownIcon, HandIcon, PaperclipIcon, PlanIcon, SendIcon, StopIcon, TargetIcon } from "../ui/icons";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";

const MODES: { id: Mode; Icon: typeof HandIcon }[] = [
  { id: "ask", Icon: HandIcon },
  { id: "auto", Icon: BoltIcon },
  { id: "plan", Icon: PlanIcon },
];

const EFFORTS: Effort[] = ["auto", "low", "medium", "high", "xhigh", "max"];

/** A button that opens a menu above it; the menu closes on a pick, a click outside or Esc. */
function Popover({ button, title, children, className = "" }: { button: ReactNode; title: string; children: (close: () => void) => ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className={`agent-pop ${className}`} ref={wrap}>
      <button type="button" className={`agent-chip ${open ? "is-open" : ""}`} title={title} aria-label={title} aria-expanded={open} onClick={() => setOpen(!open)}>
        {button}
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="agent-menu" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** The model the default stands for, by name: "Opus 5.5". */
const defaultModel = (models: ModelInfo[]) => {
  const own = models.find((m) => m.value === "default");
  return own?.resolvedModel ? models.find((m) => m.value !== "default" && m.resolvedModel === own.resolvedModel)?.displayName : undefined;
};

/** A model's name in the menu: "Padrão (Opus 5.5)", "Sonnet 5.5". */
export function modelName(models: ModelInfo[], value: string): string {
  if (value === "default") {
    const name = defaultModel(models);
    return name ? `${t("agent.effort.auto")} (${name})` : t("agent.effort.auto");
  }
  return models.find((m) => m.value === value)?.displayName ?? value;
}

/** And on the composer's chip, where room is short: "Opus 5.5". */
const chipName = (models: ModelInfo[], value: string) => (value === "default" ? (defaultModel(models) ?? t("agent.effort.auto")) : modelName(models, value));

function ModeMenu() {
  const mode = useAgent((s) => s.mode);
  const setMode = useAgent((s) => s.setMode);
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  return (
    <Popover
      className={`agent-mode-${mode}`}
      title={`${t("agent.mode")}: ${t(`agent.mode.${mode}`)}`}
      button={
        <>
          <current.Icon size={14} />
          <span className="agent-chip-text">{t(`agent.modeShort.${mode}`)}</span>
        </>
      }
    >
      {(close) =>
        MODES.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            role="menuitemradio"
            aria-checked={id === mode}
            className={`agent-menu-item ${id === mode ? "is-on" : ""}`}
            onClick={() => {
              setMode(id);
              close();
            }}
          >
            <Icon size={15} />
            <span className="agent-menu-text">
              <span>{t(`agent.mode.${id}`)}</span>
              <span className="agent-menu-hint">{t(`agent.mode.${id}Hint`)}</span>
            </span>
            {id === mode && <CheckIcon size={14} />}
          </button>
        ))
      }
    </Popover>
  );
}

function ModelMenu() {
  const models = useAgent((s) => s.models);
  const model = useAgent((s) => s.model);
  const effort = useAgent((s) => s.effort);
  const account = useAgent((s) => s.account);
  const setModel = useAgent((s) => s.setModel);
  const setEffort = useAgent((s) => s.setEffort);
  const info = models.find((m) => m.value === model);
  const levels = info?.supportedEffortLevels;
  const label = modelName(models, model);
  return (
    <Popover
      className="agent-model"
      title={`${t("agent.model")}: ${label}${effort !== "auto" ? ` · ${t("agent.effort")}: ${t(`agent.effort.${effort}`)}` : ""}`}
      button={
        <span className="agent-chip-text">
          {chipName(models, model)}
          {effort !== "auto" && levels?.length ? <span className="agent-chip-sub"> · {t(`agent.effort.${effort}`)}</span> : null}
        </span>
      }
    >
      {() => (
        <>
          <div className="agent-menu-label">{t("agent.model")}</div>
          <div className="agent-menu-scroll">
            {(models.length ? models : [{ value: "default", displayName: "", description: "" } as ModelInfo]).map((m) => (
              <button key={m.value} type="button" role="menuitemradio" aria-checked={m.value === model} className={`agent-menu-item ${m.value === model ? "is-on" : ""}`} onClick={() => setModel(m.value)}>
                <span className="agent-menu-text">
                  <span>{modelName(models, m.value)}</span>
                </span>
                {m.value === model && <CheckIcon size={14} />}
              </button>
            ))}
          </div>
          {levels?.length ? (
            <>
              <div className="agent-menu-label" title={t("agent.effortHint")}>
                {t("agent.effort")}
              </div>
              <div className="agent-effort" role="radiogroup" aria-label={t("agent.effort")}>
                {EFFORTS.filter((e) => e === "auto" || levels.includes(e)).map((e) => (
                  <button key={e} type="button" role="radio" aria-checked={e === effort} className={e === effort ? "is-on" : ""} onClick={() => setEffort(e)}>
                    {t(`agent.effort.${e}`)}
                  </button>
                ))}
              </div>
              <div className="agent-menu-hint agent-menu-pad">{t("agent.effortHint")}</div>
            </>
          ) : null}
          {account?.email && (
            <div className="agent-menu-account">
              {t("agent.signedIn", { email: account.email })}
              {account.subscriptionType ? ` · ${account.subscriptionType}` : ""}
            </div>
          )}
          <Extensions />
          <Usage />
        </>
      )}
    </Popover>
  );
}

/** The person's skills and MCP servers the conversation has, and how the servers are doing. */
function Extensions() {
  const skills = useAgent((s) => s.skills);
  const mcp = useAgent((s) => s.mcp);
  if (!skills.length && !mcp.length) return null;
  return (
    <div className="agent-menu-ext">
      {skills.length > 0 && (
        <div title={skills.map((s) => s.name).join("\n")}>
          {t("agent.skills", { n: String(skills.length) })}: {skills.map((s) => s.name).join(", ")}
        </div>
      )}
      {mcp.length > 0 && (
        <div>
          {t("agent.mcp")}:{" "}
          {mcp.map((m, i) => (
            <span key={m.name} className={`agent-mcp is-${m.status}`} title={m.error ?? t(`agent.mcp.${m.status}`)}>
              {i > 0 && ", "}
              {m.name} {m.status === "connected" ? "✓" : m.status === "pending" ? "…" : "✗"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The selection on the canvas, which goes along with the message unless turned off. */
function SelectionChip() {
  const withSelection = useAgent((s) => s.withSelection);
  const toggle = useAgent((s) => s.toggleSelection);
  // Re-rendered with the selection and the course's titles.
  useEditor((s) => s.selection);
  useEditor((s) => s.course);
  const label = selectionLabel();
  if (!label) return null;
  return (
    <button type="button" className={`agent-chip agent-selection ${withSelection ? "" : "is-off"}`} onClick={toggle} title={withSelection ? t("agent.selectionOn") : t("agent.selectionOff")} aria-pressed={withSelection}>
      <TargetIcon size={13} />
      <span className="agent-chip-text">{label}</span>
    </button>
  );
}

export function Composer({ focusKey }: { focusKey: number }) {
  const busy = useAgent((s) => s.busy);
  const send = useAgent((s) => s.send);
  const interrupt = useAgent((s) => s.interrupt);
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => area.current?.focus(), [focusKey]);

  // The box grows with the text, up to a point.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [text]);

  // A suggestion from the empty conversation lands here.
  useEffect(() => {
    const put = (e: Event) => {
      setText((e as CustomEvent<string>).detail);
      area.current?.focus();
    };
    window.addEventListener("agent-suggest", put);
    return () => window.removeEventListener("agent-suggest", put);
  }, []);

  const submit = () => {
    if (!text.trim()) return;
    void send(text);
    setText("");
  };

  const attach = async () => {
    const path = await pickOpen([]);
    if (!path) return;
    setText((v) => `${v}${v && !/\s$/.test(v) ? " " : ""}${path} `);
    area.current?.focus();
  };

  return (
    <div className="agent-composer">
      <textarea
        ref={area}
        className="agent-input"
        rows={2}
        value={text}
        placeholder={busy ? t("agent.placeholderBusy") : t("agent.placeholder")}
        aria-label={t("agent.placeholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && busy) {
            e.preventDefault();
            interrupt();
          }
        }}
      />
      <div className="agent-composer-bar">
        <SelectionChip />
        {isTauri() && (
          <button type="button" className="agent-icon-btn" onClick={attach} title={t("agent.attach")} aria-label={t("agent.attach")}>
            <PaperclipIcon size={15} />
          </button>
        )}
        <span className="spacer" />
        <ModeMenu />
        <ModelMenu />
        {busy && !text.trim() ? (
          <button type="button" className="agent-send is-stop" onClick={interrupt} title={t("agent.stop")} aria-label={t("agent.stop")}>
            <StopIcon size={16} />
          </button>
        ) : (
          <button type="button" className="agent-send" onClick={submit} disabled={!text.trim()} title={t("agent.send")} aria-label={t("agent.send")}>
            <SendIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
