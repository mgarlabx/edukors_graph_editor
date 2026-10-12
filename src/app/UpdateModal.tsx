/**
 * A new version of the editor (src/app/updates.ts): what it brings, and the
 * download once the person agrees; or, from the menu, that there is none, or
 * why it could not be found out.
 */
import { useUi } from "../store/ui";
import { Modal } from "../ui/controls";
import { Markdown } from "../agent/Markdown";
import { t } from "../i18n";
import { isWindows } from "./os";
import { installUpdate, useUpdate } from "./updates";
import { APP_VERSION, shortVersion } from "./version";

const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(0);

export function UpdateModal() {
  const close = useUi((s) => s.close);
  const { status, update, error, done, total } = useUpdate();
  const downloading = status === "downloading";

  const ok = (
    <>
      <span className="spacer" />
      <button className="btn btn-primary" onClick={close} autoFocus>
        {t("common.ok")}
      </button>
    </>
  );
  const actions =
    status === "available" ? (
      <>
        <span className="spacer" />
        <button className="btn" onClick={close}>
          {t("update.later")}
        </button>
        <button className="btn btn-primary" onClick={() => void installUpdate()} autoFocus>
          {t("update.now")}
        </button>
      </>
    ) : status === "latest" || status === "error" ? (
      ok
    ) : undefined;

  return (
    <Modal title={t("update.title")} onClose={close} actions={actions} dismissable={!downloading}>
      <div className="update">
        {status === "checking" && <p className="muted">{t("update.checking")}</p>}
        {status === "latest" && <p>{t("update.latest", { version: APP_VERSION })}</p>}
        {status === "error" && (
          <>
            <p>{t("update.failed")}</p>
            <p className="small muted">{error}</p>
          </>
        )}
        {(status === "available" || downloading) && update && (
          <>
            <p className="update-versions">{t("update.versions", { current: APP_VERSION, next: shortVersion(update.version) })}</p>
            {update.body?.trim() && <Markdown className="update-notes" text={update.body} />}
            {isWindows && <p className="small muted">{t("update.windows")}</p>}
          </>
        )}
        {downloading && (
          <div className="update-progress">
            <progress max={total ?? undefined} value={total ? done : undefined} />
            <span className="small muted">
              {total ? t("update.progress", { done: megabytes(done), total: megabytes(total) }) : t("update.downloading")}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
