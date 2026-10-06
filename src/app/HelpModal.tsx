/**
 * Help: the quick guide (a few steps and the shortcuts), the full teacher's
 * guide, docs/guia-do-professor*.md, and the terms of use, in the interface's
 * language.
 */
import { useState } from "react";
import { useUi, type HelpTab } from "../store/ui";
import { Modal, Tabs } from "../ui/controls";
import { Markdown } from "../agent/Markdown";
import { t, useUiLang, type UiLang } from "../i18n";
import { keyLabel } from "./os";
import { TermsText } from "./TermsModal";
import { APP_NAME, APP_VERSION } from "./version";
import guidePt from "../../docs/guia-do-professor.md?raw";
import guideEn from "../../docs/guia-do-professor.en.md?raw";
import guideEs from "../../docs/guia-do-professor.es.md?raw";

const GUIDES: Record<UiLang, string> = { pt: guidePt, en: guideEn, es: guideEs };

const SHORTCUTS: [string, string][] = [
  ["⌘N", "file.new"],
  ["⌘O", "file.open"],
  ["⌘S", "file.save"],
  ["⇧⌘S", "file.saveAs"],
  ["⌘W", "tabs.close"],
  ["⌃⇥ / ⌃⇧⇥", "help.cycleTabs"],
  ["⌘1 … ⌘9", "help.goToTab"],
  ["⌘Z / ⇧⌘Z", "help.undoRedo"],
  ["⌫", "help.delete"],
  ["⌘D", "insp.duplicate"],
  ["⌘C / ⌘V", "help.copyPaste"],
  ["⌘A", "help.selectAll"],
  ["⌘0", "canvas.fit"],
  ["⇧⌘L", "canvas.layout"],
  ["⇧⌘M", "problems.title"],
  ["⌘M", "tab.canvas"],
  ["⌘J", "tab.json"],
  ["⌘P", "tab.preview"],
  ["⌘,", "prefs.title"],
  ["⇧⌘A", "agent.title"],
  ["⌥⌘0", "sidebar.toggle"],
  ["Esc", "help.deselect"],
];

export function HelpModal() {
  const close = useUi((s) => s.close);
  const lang = useUiLang();
  const [tab, setTab] = useState<HelpTab>(() => useUi.getState().helpTab);
  return (
    <Modal title={t("help.title")} onClose={close} wide="full">
      <div className="help-tabs">
        <Tabs<HelpTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "quick", label: t("help.quick") },
            { id: "full", label: t("help.full") },
            { id: "terms", label: t("terms.title") },
          ]}
        />
        <span className="help-version">
          {APP_NAME} · {t("app.version", { version: APP_VERSION })}
        </span>
      </div>
      {tab === "quick" && <QuickGuide />}
      {tab === "full" && <Markdown text={keyLabel(GUIDES[lang] ?? guidePt)} className="help-guide" />}
      {tab === "terms" && <TermsText />}
    </Modal>
  );
}

function QuickGuide() {
  return (
    <div className="help-quick">
      <p>{t("help.lead")}</p>
      <ol className="help-steps">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <li key={n}>{t(`help.step${n}`)}</li>
        ))}
      </ol>
      <h3>{t("help.shortcuts")}</h3>
      <table className="table small">
        <tbody>
          {SHORTCUTS.map(([key, label]) => (
            <tr key={key}>
              <td>
                <kbd>{keyLabel(key)}</kbd>
              </td>
              <td>{t(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
