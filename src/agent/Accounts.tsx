/**
 * The AI accounts, in the preferences, and the sign-in box the panel shares.
 *
 * Accounts live in the shared EDUKORS registry (@edukors/ai-cli): adding,
 * signing out or removing one here is the same for every EDUKORS app on this
 * computer, and removing says so. Signing in opens the provider's page in the
 * browser; when it does not open, the box offers the address and, for a
 * provider that ends with a code (Claude), a field for it.
 */
import { useEffect, useState } from "react";
import {AssistantAccounts} from "@edukors/ai-ui";
import "@edukors/ai-ui/style.css";
import {usePrefs} from "../store/prefs";
import { useAgent } from "./store";
import { PROVIDER_IDS, type ProviderId } from "./events";
import { confirmDialog, openLink } from "../app/platform";
import { hasKey, t, useUiLang } from "../i18n";

/** The sign-in in progress for an account: waiting for the browser, the fallback address, the code. */
export function SignInBox({ accountId }: { accountId: string }) {
  const signIn = useAgent((s) => (s.signIn?.accountId === accountId ? s.signIn : null));
  const submitCode = useAgent((s) => s.submitCode);
  const cancel = useAgent((s) => s.cancelSignIn);
  const [code, setCode] = useState("");
  if (!signIn) return null;
  return (
    <div className="agent-signin" role="group" aria-label={t("signin.title")}>
      <p className="small">
        {!signIn.checking && <span className="spinner" />} {t(signIn.checking ? "signin.checking" : "signin.waiting")}
      </p>
      {signIn.url && (
        <>
          <p className="small muted">{t("signin.noBrowser")}</p>
          <div className="row">
            <button type="button" className="btn btn-small" onClick={() => void openLink(signIn.url!)}>
              {t("signin.open")}
            </button>
            <button type="button" className="btn btn-small" onClick={() => void navigator.clipboard?.writeText(signIn.url!)}>
              {t("signin.copy")}
            </button>
          </div>
        </>
      )}
      {signIn.url && signIn.acceptsCode && (
        <form
          className="agent-signin-code"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void submitCode(code.trim());
          }}
        >
          <label className="small">
            {t("signin.codeLabel")}
            <input className="input mono" value={code} spellCheck={false} autoComplete="off" onChange={(e) => setCode(e.target.value)} disabled={signIn.checking} />
          </label>
          <p className="small muted">{t("signin.codeHint")}</p>
          <button type="submit" className="btn btn-small btn-primary" disabled={!code.trim() || signIn.checking}>
            {t("signin.submit")}
          </button>
        </form>
      )}
      {signIn.error && <p className="small error">{hasKey(`signin.err.${signIn.error}`) ? t(`signin.err.${signIn.error}`) : t("signin.failed")}</p>}
      <button type="button" className="btn btn-small" onClick={cancel}>
        {t("common.cancel")}
      </button>
    </div>
  );
}

/** Shared account configuration; provider calls stay behind the Tauri host. */
export function AccountsSection() {
  const accounts=useAgent(s=>s.accounts),detections=useAgent(s=>s.detections),signIn=useAgent(s=>s.signIn),busy=useAgent(s=>s.busy),error=useAgent(s=>s.accountsError);
  const lang=useUiLang(),prefs=usePrefs(),[loaded,setLoaded]=useState(false);
  const agent=useAgent.getState();
  useEffect(()=>{let active=true;void agent.refreshAccounts().catch(()=>undefined).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;agent.cancelSignIn();};},[]);
  if(!loaded)return <p>{t('prefs.accountsLoading')}</p>;
  if(error)return <div><p role="alert">{t(error.code==='unavailable'?'prefs.accountsUnavailable':'prefs.accountsFailed')}</p><button onClick={()=>void agent.refreshAccounts().catch(()=>undefined)}>{t('agent.retry')}</button></div>;
  return <AssistantAccounts lang={lang} accounts={accounts} providers={PROVIDER_IDS.map(id=>({id,status:detections.find(d=>d.providerId===id)?.status||'missing'}))} value={prefs.agent.account} busy={busy}
    onSelect={async id=>{await prefs.save({agent:{...usePrefs.getState().agent,account:id||null}});if(id)await agent.selectAccount(id);}}
    onCreate={(provider,label)=>agent.addAccount(provider as ProviderId,label)} onConnect={async id=>{await agent.connectAccount(id);if(useAgent.getState().signIn?.error)throw Error(t('signin.failed'));}} onLogout={async id=>{await agent.logoutAccount(id);await agent.refreshAccounts();}}
    onRename={agent.renameAccount} onRemove={async(id,message)=>{if(await confirmDialog(message,t('prefs.accountRemove'),t('prefs.accountRemove'),t('common.cancel')))await agent.removeAccount(id);}}
    onVerify={agent.refreshAccounts} onStatus={agent.accountStatus} onOpen={openLink} login={signIn?.error?null:signIn} onCode={agent.submitCode} onCancel={agent.cancelSignIn}/>;
}
