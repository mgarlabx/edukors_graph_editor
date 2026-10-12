import { useMemo } from "react";
import { courseLangs, useEditor } from "../store/editor";
import { useUi } from "../store/ui";
import { Modal } from "../ui/controls";
import { confirm, prompt } from "../ui/dialogs";
import { addLanguage, ISO_639_1, LANG_RE, makeSource, OFFERED_LANGS, removeLanguage, renameLanguage } from "./languages";
import { coverage } from "./texts";
import { t } from "../i18n";

export function LanguagesModal() {
  const close = useUi((s) => s.close);
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const langs = courseLangs(course);
  const report = useMemo(() => coverage(course, langs), [course]); // eslint-disable-line react-hooks/exhaustive-deps

  const canAdd = (code: string) => LANG_RE.test(code) && !langs.includes(code);

  return (
    <Modal title={t("lang.title")} onClose={close} wide>
      <table className="table">
        <thead>
          <tr>
            <th>{t("lang.code")}</th>
            <th>{t("lang.name")}</th>
            <th>{t("lang.coverage")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {langs.map((l, i) => {
            const r = report.find((x) => x.lang === l)!;
            return (
              <tr key={l}>
                <td>
                  <strong>{l}</strong> {i === 0 && <span className="pill">{t("lang.source")}</span>}
                </td>
                <td>{ISO_639_1[l.split("-")[0]] ?? "?"}</td>
                <td>
                  {r.total - r.missing.length}/{r.total}
                </td>
                <td className="row">
                  <button
                    className="link"
                    onClick={async () => {
                      const to = await prompt(t("lang.rename"), t("lang.renamePrompt", { lang: l }), l);
                      if (to && LANG_RE.test(to) && !langs.includes(to)) update((c) => renameLanguage(c, l, to), "lang-rename");
                    }}
                  >
                    {t("lang.rename")}
                  </button>
                  {i > 0 && (
                    <>
                      <button className="link" onClick={() => update((c) => makeSource(c, l), "lang-source")}>
                        {t("lang.makeSource")}
                      </button>
                      <button
                        className="link danger"
                        onClick={async () => {
                          if (await confirm(t("lang.removeConfirm", { lang: l }), t("lang.remove"), t("lang.remove"), true)) update((c) => removeLanguage(c, l), "lang-remove");
                        }}
                      >
                        {t("lang.remove")}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>{t("lang.add")}</h3>
      <div className="chips">
        {OFFERED_LANGS.map((code) => (
          <button key={code} className="chip" disabled={!canAdd(code)} onClick={() => update((c) => addLanguage(c, code), "lang-add")}>
            <strong>{code}</strong> {ISO_639_1[code]}
          </button>
        ))}
      </div>
    </Modal>
  );
}
