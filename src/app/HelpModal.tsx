import { useUi } from "../store/ui";
import { Modal } from "../ui/controls";
import { t } from "../i18n";

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
  return (
    <Modal title={t("help.title")} onClose={close} wide>
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
                <kbd>{key}</kbd>
              </td>
              <td>{t(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">{t("help.docs")}</p>
    </Modal>
  );
}
