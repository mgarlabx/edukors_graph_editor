/**
 * The AI agent, in the right side panel: a bar with the conversation's title,
 * a new conversation and the past ones; the conversation; what the agent asks;
 * and the composer with the conversation's settings.
 *
 * It takes the inspector's place while it is open (App.tsx), and goes beside
 * the text in the full-screen content editor (ContentEditor.tsx).
 */
import { useEffect, useState } from "react";
import { sessionTitle, useAgent } from "./store";
import { NODE_INSTALL, PROVIDER_INSTALL, type ProviderId } from "./events";
import { SignInBox } from "./Accounts";
import { Messages } from "./Messages";
import { Asks } from "./Asks";
import { Composer } from "./Composer";
import { Usage } from "./Usage";
import { useUi } from "../store/ui";
import { usePrefs } from "../store/prefs";
import { useResizable } from "../ui/resize";
import { openLink } from "../app/platform";
import { hasKey, t, useUiLang } from "../i18n";
import { AiIcon } from "../ui/icons";
import {AssistantHeader,ConversationList} from "@edukors/ai-ui";
import {useEditor} from "../store/editor";
import {docState} from "../store/docs";

function Header(){
 const s=useAgent(),lang=useUiLang(),active=useEditor(e=>e.docId),[list,setList]=useState(false);
 const bound=s.conversationDocument||active,doc=bound?(docState(bound)?.path||bound):'';
 return <><AssistantHeader lang={lang} title={s.title||undefined} document={doc} busy={s.busy} onNew={()=>void s.newSession()} onHistory={()=>{setList(!list);void s.loadSessions();}} onClose={()=>useUi.getState().toggleAgent(false)}/>{s.legacy&&<p className="small" role="status">{t("agent.legacyReadOnly")}</p>}{list&&<ConversationList lang={lang} current={s.conversationId} busy={s.busy} items={(s.sessions||[]).filter(c=>!c.documentPath&&!c.documentId||c.documentId===bound||!!c.documentPath&&c.documentPath===docState(bound||'')?.path).map(c=>({id:c.id,title:sessionTitle(c),updated:c.lastModified,account:s.accounts.find(a=>a.id===c.accountId)?.label}))} onOpen={id=>{void s.resume(id);setList(false);}} onDelete={id=>{if(confirm(t('agent.deleteSession')))void s.deleteSession(id);}}/>}</>;
}

const SUGGESTIONS = ["agent.try1", "agent.try2", "agent.try3"];

/** The account the agent runs on, as a line: "Trabalho · Claude · ana@escola.org". */
function AccountLine() {
  const account = useAgent((s) => s.accounts.find((a) => a.id === s.accountId));
  const status = useAgent((s) => s.status);
  if (!account) return null;
  return (
    <p className="agent-account muted small">
      {account.label} · {t(`agent.provider.${account.providerId}`)}
      {status?.identity ? ` · ${status.identity}` : ""}
    </p>
  );
}

/** What the panel shows before the first message: the state of the connection, or where to start. */
function Start() {
  const connection = useAgent((s) => s.connection);
  const error = useAgent((s) => s.error);
  const accountId = useAgent((s) => s.accountId);
  const account = useAgent((s) => s.accounts.find((a) => a.id === s.accountId));
  const status = useAgent((s) => s.status);
  const signingIn = useAgent((s) => !!s.signIn);
  const retry = useAgent((s) => s.retry);
  const connectAccount = useAgent((s) => s.connectAccount);

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
  if (connection === "error" && error) {
    const provider = (error.providerId ?? account?.providerId) as ProviderId | undefined;
    const missing = error.code === "CLI_MISSING" || error.code === "CLI_INCOMPATIBLE";
    const key = missing
      ? error.code === "CLI_MISSING"
        ? "agent.err.providerMissing"
        : "agent.err.providerOld"
      : hasKey(`agent.err.${error.code}`)
        ? `agent.err.${error.code}`
        : "agent.err.failed";
    return (
      <div className="agent-start">
        <div className="agent-notice agent-notice-error" role="alert">
          <div>{t(key, { provider: provider ? t(`agent.provider.${provider}`) : "" })}</div>
          {error.detail && !missing && (
            <details>
              <summary>{t("agent.details")}</summary>
              <pre className="agent-pre">{error.detail}</pre>
            </details>
          )}
        </div>
        <div className="agent-start-actions">
          {((missing && provider) || error.code === "node-missing") && (
            <button type="button" className="btn btn-small btn-primary" onClick={() => void openLink(missing && provider ? PROVIDER_INSTALL[provider] : NODE_INSTALL)}>
              {t("agent.provider.install")}
            </button>
          )}
          {error.code !== "unavailable" && (
            <button type="button" className="btn btn-small" onClick={() => void retry()}>
              {t("agent.retry")}
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!accountId)
    return (
      <div className="agent-start">
        <div className="agent-notice agent-notice-warning">
          <strong>{t("agent.noAccount")}</strong>
          <div>{t("agent.noAccountHelp")}</div>
        </div>
        <div className="agent-start-actions">
          <button type="button" className="btn btn-small btn-primary" onClick={() => useUi.getState().openPrefs("agent")}>
            {t("agent.openAccounts")}
          </button>
        </div>
      </div>
    );
  if (status && status.state !== "connected")
    return (
      <div className="agent-start">
        <div className="agent-notice agent-notice-warning">
          <strong>{t("agent.signInTitle", { name: account?.label ?? "" })}</strong>
          <div>{t(status.state === "expired" ? "agent.signInExpired" : "agent.signInHelp")}</div>
        </div>
        {signingIn ? (
          <SignInBox accountId={accountId} />
        ) : (
          <div className="agent-start-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={() => void connectAccount(accountId)}>
              {t("prefs.accountConnect")}
            </button>
            <button type="button" className="btn btn-small" onClick={() => useUi.getState().openPrefs("agent")}>
              {t("agent.openAccounts")}
            </button>
          </div>
        )}
        <AccountLine />
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
      <AccountLine />
      <Usage compact />
    </div>
  );
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 760;

/** `focus`: the composer takes the focus when the panel opens, not when it only moves (into the content editor and back). */
export function AgentPanel({ focus = true }: { focus?: boolean } = {}) {
  const saved = usePrefs((s) => s.agent.width);
  // Dragging the left edge resizes the panel; the width is kept in the preferences.
  const { width, handle } = useResizable(saved, MIN_WIDTH, MAX_WIDTH, (w) =>
    usePrefs.getState().save({ agent: { ...usePrefs.getState().agent, width: w } }),
  );
  const docId=useEditor(s=>s.docId), busy=useAgent(s=>s.busy);
  useEffect(()=>{if(!busy)void useAgent.getState().focusDocument(docId);},[docId,busy]);
  const [focusKey] = useState(() => (focus ? Date.now() : 0));

  useEffect(()=>{const refresh=()=>{void useAgent.getState().refreshAccounts().catch(()=>undefined);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
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
      <Usage />
    </aside>
  );
}
