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
import type { AccountInfo, AccountStatus } from "@edukors/ai-cli";
import { useAgent } from "./store";
import { PROVIDER_IDS, PROVIDER_INSTALL, type ProviderId } from "./events";
import { confirmDialog, openLink } from "../app/platform";
import { hasKey, t } from "../i18n";

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

function StateBadge({ status }: { status: AccountStatus | "checking" | undefined }) {
  const state = status === undefined || status === "checking" ? "checking" : status.state;
  return <span className={`agent-account-state is-${state}`}>{t(`prefs.accountState.${state}`)}</span>;
}

function AccountRow({ account }: { account: AccountInfo }) {
  const inUse = useAgent((s) => s.accountId === account.id);
  const signingIn = useAgent((s) => s.signIn?.accountId === account.id);
  const detection = useAgent((s) => s.detections.find((d) => d.providerId === account.providerId));
  const agent = useAgent.getState();
  const [status, setStatus] = useState<AccountStatus | "checking">("checking");
  const missing = detection && detection.status !== "ready";

  const check = () => {
    setStatus("checking");
    agent.accountStatus(account.id).then(setStatus, () => setStatus({ state: "unknown" }));
  };
  // Checked when shown, and again when a sign-in ends.
  useEffect(() => {
    if (!signingIn && !missing) check();
  }, [signingIn, missing]); // eslint-disable-line react-hooks/exhaustive-deps

  const connected = status !== "checking" && status.state === "connected";
  return (
    <li className="agent-account">
      <div className="agent-account-head">
        <span className="agent-account-name">
          <strong>{account.label}</strong> <span className="muted small">· {t(`agent.provider.${account.providerId}`)}</span>
        </span>
        {missing ? <span className="agent-account-state is-missing">{t("prefs.accountState.missing")}</span> : <StateBadge status={status} />}
        {inUse && <span className="agent-account-inuse small">{t("prefs.accountInUse")}</span>}
      </div>
      {status !== "checking" && status.identity && <div className="small muted">{status.identity}</div>}
      {missing ? (
        <div className="row">
          <span className="small muted">{t(detection.status === "incompatible" ? "agent.err.providerOld" : "agent.err.providerMissing", { provider: t(`agent.provider.${account.providerId}`) })}</span>
          <button type="button" className="btn btn-small" onClick={() => void openLink(PROVIDER_INSTALL[account.providerId as ProviderId])}>
            {t("agent.provider.install")}
          </button>
        </div>
      ) : signingIn ? (
        <SignInBox accountId={account.id} />
      ) : (
        <div className="row">
          {!inUse && connected && (
            <button type="button" className="btn btn-small btn-primary" onClick={() => void agent.selectAccount(account.id)}>
              {t("prefs.accountUse")}
            </button>
          )}
          {!connected && status !== "checking" && (
            <button type="button" className="btn btn-small btn-primary" onClick={() => void agent.connectAccount(account.id)}>
              {t(status.state === "expired" ? "prefs.accountReconnect" : "prefs.accountConnect")}
            </button>
          )}
          {connected && (
            <button type="button" className="btn btn-small" onClick={() => void agent.logoutAccount(account.id).then(check)}>
              {t("prefs.accountLogout")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-small"
            onClick={async () => {
              if (await confirmDialog(t("prefs.accountRemoveConfirm", { name: account.label }), t("prefs.accountRemove"), t("prefs.accountRemove"), t("common.cancel"))) await agent.removeAccount(account.id);
            }}
          >
            {t("prefs.accountRemove")}
          </button>
        </div>
      )}
    </li>
  );
}

function AddAccount() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {t("prefs.accountAdd")}
      </button>
    );
  const add = async () => {
    setError(null);
    try {
      const agent = useAgent.getState();
      const id = await agent.addAccount(provider, label.trim() || t(`agent.provider.${provider}`));
      setOpen(false);
      setLabel("");
      void agent.connectAccount(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="agent-account-add">
      <div className="prefs-choices" role="radiogroup" aria-label={t("prefs.accountProvider")}>
        {PROVIDER_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={provider === id} className={`prefs-choice ${provider === id ? "is-active" : ""}`} onClick={() => setProvider(id)}>
            <span className="prefs-radio" />
            {t(`agent.provider.${id}`)}
          </button>
        ))}
      </div>
      <label className="small">
        {t("prefs.accountLabel")}
        <input className="input" value={label} placeholder={t("prefs.accountLabelPlaceholder")} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <p className="small muted">{t("prefs.accountAddHint")}</p>
      {error && <p className="small error">{error}</p>}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void add()}>
          {t("prefs.accountAddSignIn")}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

/** The accounts section of the preferences. */
export function AccountsSection() {
  const accounts = useAgent((s) => s.accounts);
  const error = useAgent((s) => s.accountsError);
  const [loaded, setLoaded] = useState(false);
  const load = () => {
    void useAgent
      .getState()
      .refreshAccounts()
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  };
  useEffect(load, []);
  if (!loaded) return <p className="small muted">{t("prefs.accountsLoading")}</p>;
  // Cleared as soon as any read succeeds, here or in the panel.
  if (error)
    return (
      <div className="agent-accounts">
        <p className="small muted">{error.code === "unavailable" ? t("prefs.accountsUnavailable") : t("prefs.accountsFailed")}</p>
        {error.code !== "unavailable" && error.detail && <p className="small muted">{error.detail}</p>}
        {error.code !== "unavailable" && (
          <button type="button" className="btn" onClick={load}>
            {t("agent.retry")}
          </button>
        )}
      </div>
    );
  return (
    <div className="agent-accounts">
      <p className="small muted">{t("prefs.agentAccountsHint")}</p>
      {accounts.length ? (
        <ul className="agent-account-list">
          {accounts.filter((a) => a.supported).map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </ul>
      ) : (
        <p className="small muted">{t("prefs.accountNone")}</p>
      )}
      <AddAccount />
    </div>
  );
}
