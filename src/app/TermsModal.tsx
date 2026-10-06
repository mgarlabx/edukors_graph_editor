/**
 * The terms of use (the MIT license, explained): docs/termos-de-uso*.md, in
 * the interface's language. Until the person accepts the current version the
 * editor shows nothing else and does nothing; Help shows them again later.
 */
import { useState } from "react";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { Modal } from "../ui/controls";
import { Markdown } from "../agent/Markdown";
import { UI_LANGS, t, useUiLang, type UiLang } from "../i18n";
import { isTauri } from "./platform";
import termsPt from "../../docs/termos-de-uso.md?raw";
import termsEn from "../../docs/termos-de-uso.en.md?raw";
import termsEs from "../../docs/termos-de-uso.es.md?raw";

/** Bump it when the terms change: everyone is asked to accept them again. */
export const TERMS_VERSION = "2026-10-06";

const TERMS: Record<UiLang, string> = { pt: termsPt, en: termsEn, es: termsEs };

/** Whether the person accepted the terms in force (false until the preferences are loaded). */
export const termsAccepted = () => {
  const prefs = usePrefs.getState();
  return prefs.loaded && prefs.terms === TERMS_VERSION;
};

/** The terms, as text to read. */
export function TermsText() {
  const lang = useUiLang();
  return <Markdown text={TERMS[lang] ?? termsPt} className="help-guide" />;
}

/** The terms, to accept before anything else; declining closes the editor. */
export function TermsGate() {
  const lang = useUiLang();
  const [declined, setDeclined] = useState(false);
  const accept = () => {
    void usePrefs.getState().save({ terms: TERMS_VERSION });
    if (!useUi.getState().modal) useUi.getState().open("about");
  };
  const decline = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    } else setDeclined(true);
  };
  return (
    <Modal
      title={t("terms.title")}
      onClose={() => undefined}
      dismissable={false}
      wide
      actions={
        <>
          <select className="input input-small" value={lang} onChange={(e) => void usePrefs.getState().save({ uiLang: e.target.value as UiLang })} aria-label={t("prefs.uiLang")}>
            {UI_LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`ui.${l}`)}
              </option>
            ))}
          </select>
          <span className="spacer" />
          {declined && <span className="small muted">{t("terms.declined")}</span>}
          <button className="btn" onClick={decline}>
            {t("terms.decline")}
          </button>
          <button className="btn btn-primary" onClick={accept} autoFocus>
            {t("terms.accept")}
          </button>
        </>
      }
    >
      <TermsText />
    </Modal>
  );
}
