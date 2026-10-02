/**
 * The AI agent, in the right side panel: a bar with the conversation's title,
 * a new conversation and the past ones; the conversation; what the agent asks;
 * and the composer with the conversation's settings.
 *
 * It takes the inspector's place while it is open (App.tsx).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { useAgent } from "./store";
import { Messages } from "./Messages";
import { Asks } from "./Asks";
import { Composer } from "./Composer";
import { Usage } from "./Usage";
import { useUi } from "../store/ui";
import { usePrefs } from "../store/prefs";
import { useResizable } from "../ui/resize";
import { confirmDialog } from "../app/platform";
import { t } from "../i18n";
import { AiIcon, ChevronDownIcon, CloseIcon, NewChatIcon, SearchIcon, TrashIcon } from "../ui/icons";

const DAY = 86_400_000;

function groupOf(ms: number, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= today) return "agent.today";
  if (ms >= today - DAY) return "agent.yesterday";
  if (ms >= today - 6 * DAY) return "agent.week";
  return "agent.older";
}

const when = (ms: number, group: string) =>
  group === "agent.today" || group === "agent.yesterday"
    ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });

const titleOf = (s: SDKSessionInfo) => s.customTitle || s.summary || s.firstPrompt || s.sessionId.slice(0, 8);

function SessionList({ onClose }: { onClose: () => void }) {
  const sessions = useAgent((s) => s.sessions);
  const current = useAgent((s) => s.sessionId);
  const resume = useAgent((s) => s.resume);
  const remove = useAgent((s) => s.deleteSession);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void useAgent.getState().loadSessions();
  }, []);

  const groups = useMemo(() => {
    const now = new Date();
    const q = query.trim().toLowerCase();
    const out = new Map<string, SDKSessionInfo[]>();
    for (const s of sessions ?? []) {
      if (q && !`${titleOf(s)} ${s.firstPrompt ?? ""}`.toLowerCase().includes(q)) continue;
      const g = groupOf(s.lastModified, now);
      out.set(g, [...(out.get(g) ?? []), s]);
    }
    return [...out.entries()];
  }, [sessions, query]);

  return (
    <div className="agent-sessions" role="dialog" aria-label={t("agent.sessions")}>
      <label className="agent-sessions-search">
        <SearchIcon size={14} />
        <input autoFocus placeholder={t("agent.searchSessions")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} />
      </label>
      <div className="agent-sessions-list">
        {sessions === null && (
          <div className="agent-sessions-empty">
            <span className="spinner" />
          </div>
        )}
        {sessions?.length === 0 && <div className="agent-sessions-empty">{t("agent.noSessions")}</div>}
        {sessions?.length !== 0 && sessions !== null && !groups.length && <div className="agent-sessions-empty">{t("agent.noMatch")}</div>}
        {groups.map(([group, list]) => (
          <section key={group}>
            <h4>{t(group)}</h4>
            {list.map((s) => (
              <div key={s.sessionId} className={`agent-session ${s.sessionId === current ? "is-current" : ""}`}>
                <button
                  type="button"
                  className="agent-session-open"
                  onClick={() => {
                    onClose();
                    void resume(s.sessionId);
                  }}
                  title={s.firstPrompt ?? titleOf(s)}
                >
                  <span className="agent-session-title">{titleOf(s)}</span>
                  <span className="agent-session-when">{when(s.lastModified, group)}</span>
                </button>
                <button
                  type="button"
                  className="agent-icon-btn agent-session-delete"
                  title={t("agent.deleteSession")}
                  aria-label={t("agent.deleteSession")}
                  onClick={async () => {
                    if (await confirmDialog(t("agent.deleteConfirm", { name: titleOf(s) }), t("agent.deleteSession"), t("agent.deleteSession"), t("common.cancel"))) await remove(s.sessionId);
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Header() {
  const title = useAgent((s) => s.title);
  const newSession = useAgent((s) => s.newSession);
  const [list, setList] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!list) return;
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setList(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [list]);

  return (
    <header className="agent-head" ref={wrap}>
      <button type="button" className="agent-title" onClick={() => setList(!list)} aria-expanded={list} title={t("agent.sessions")}>
        <AiIcon size={15} className="icon agent-title-icon" />
        <span className="agent-title-text">{title ?? t("agent.untitled")}</span>
        <ChevronDownIcon size={13} />
      </button>
      <button type="button" className="agent-icon-btn" onClick={() => void newSession()} title={t("agent.newSession")} aria-label={t("agent.newSession")}>
        <NewChatIcon size={16} />
      </button>
      <button type="button" className="agent-icon-btn" onClick={() => useUi.getState().toggleAgent(false)} title={t("agent.close")} aria-label={t("agent.close")}>
        <CloseIcon size={16} />
      </button>
      {list && <SessionList onClose={() => setList(false)} />}
    </header>
  );
}

const SUGGESTIONS = ["agent.try1", "agent.try2", "agent.try3", "agent.try4"];

/** What the panel shows before the first message: the state of the connection, or where to start. */
function Start() {
  const connection = useAgent((s) => s.connection);
  const error = useAgent((s) => s.error);
  const account = useAgent((s) => s.account);
  const retry = useAgent((s) => s.retry);

  // The process stopped before any message: start it again.
  useEffect(() => {
    if (connection === "idle") void useAgent.getState().ensure().catch(() => undefined);
  }, [connection]);

  if (connection === "connecting" || connection === "idle")
    return (
      <div className="agent-start">
        <span className="spinner" /> {t("agent.connecting")}
      </div>
    );
  if (connection === "error" && error)
    return (
      <div className="agent-start">
        <div className="agent-notice agent-notice-error" role="alert">
          <div>{t(`agent.err.${error.code}`)}</div>
          {error.detail && (
            <details>
              <summary>{t("agent.details")}</summary>
              <pre className="agent-pre">{error.detail}</pre>
            </details>
          )}
        </div>
        {error.code !== "unavailable" && (
          <button type="button" className="btn btn-small" onClick={() => void retry()}>
            {t("agent.retry")}
          </button>
        )}
      </div>
    );
  const signedIn = !!(account?.email || account?.subscriptionType || account?.apiKeySource || account?.tokenSource);
  if (!signedIn)
    return (
      <div className="agent-start">
        <div className="agent-notice agent-notice-warning">
          <strong>{t("agent.loginTitle")}</strong>
          <div>{t("agent.loginHelp")}</div>
        </div>
        <button type="button" className="btn btn-small" onClick={() => void retry()}>
          {t("agent.retry")}
        </button>
      </div>
    );
  return (
    <div className="agent-start">
      <div className="agent-hello">
        <AiIcon size={26} className="icon agent-hello-icon" />
        <h3>{t("agent.hello")}</h3>
        <p className="muted">{t("agent.lead")}</p>
      </div>
      <div className="agent-suggestions">
        {SUGGESTIONS.map((key) => (
          <button key={key} type="button" className="agent-suggestion" onClick={() => window.dispatchEvent(new CustomEvent("agent-suggest", { detail: t(key) }))}>
            {t(key)}
          </button>
        ))}
      </div>
      {account?.email && (
        <p className="agent-account muted small">
          {t("agent.account", { email: account.email })}
          {account.subscriptionType ? ` · ${account.subscriptionType}` : ""}
        </p>
      )}
      <Usage compact />
    </div>
  );
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 760;

export function AgentPanel() {
  const saved = usePrefs((s) => s.agent.width);
  // Dragging the left edge resizes the panel; the width is kept in the preferences.
  const { width, handle } = useResizable(saved, MIN_WIDTH, MAX_WIDTH, (w) =>
    usePrefs.getState().save({ agent: { ...usePrefs.getState().agent, width: w } }),
  );
  const [focusKey] = useState(() => Date.now());

  useEffect(() => {
    void useAgent.getState().ensure().catch(() => undefined);
  }, []);

  return (
    <aside className="agent-panel" style={{ width }} aria-label={t("agent.title")}>
      {handle}
      <Header />
      <Messages empty={<Start />} />
      <Asks />
      <Composer focusKey={focusKey} />
    </aside>
  );
}
