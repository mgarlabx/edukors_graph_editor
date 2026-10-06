/**
 * What the editor opens with, every time: its name, its version and the way
 * to the terms of use (on the first run, right after they are accepted).
 */
import { useUi } from "../store/ui";
import { Modal } from "../ui/controls";
import { t } from "../i18n";
import { APP_NAME, APP_VERSION } from "./version";
import icon from "../../src-tauri/icons/128x128@2x.png";

export function AboutModal() {
  const close = useUi((s) => s.close);
  return (
    <Modal
      title={APP_NAME}
      onClose={close}
      actions={
        <>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={close} autoFocus>
            {t("about.start")}
          </button>
        </>
      }
    >
      <div className="about">
        <img className="about-icon" src={icon} alt="" width={96} height={96} />
        <div className="about-name">{APP_NAME}</div>
        <div className="about-version">{t("app.version", { version: APP_VERSION })}</div>
        <p className="about-lead">{t("about.lead")}</p>
        <p className="small muted">
          {t("about.license")}{" "}
          <button className="link" onClick={() => useUi.getState().openHelp("terms")}>
            {t("terms.title")}
          </button>
        </p>
      </div>
    </Modal>
  );
}
