import { useMemo, useState } from "react";
import { courseLangs, useEditor } from "../store/editor";
import { useUi } from "../store/ui";
import { Modal } from "../ui/controls";
import { confirm, prompt } from "../ui/dialogs";
import { addLanguage, ISO_639_1, LANG_RE, makeSource, removeLanguage, renameLanguage } from "./languages";
import { coverage } from "./texts";
import { describe } from "../schema/describe";
import { t } from "../i18n";

export function LanguagesModal() {
  const close = useUi((s) => s.close);
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const langs = courseLangs(course);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const report = useMemo(() => coverage(course, langs), [course]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = Object.entries(ISO_639_1)
    .filter(([code, name]) => !query || code.startsWith(query.toLowerCase()) || name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 24);
  const typed = region ? `${query.toLowerCase()}-${region.toUpperCase()}` : query.toLowerCase();
  const canAdd = (code: string) => LANG_RE.test(code) && !langs.includes(code);

  return (
    <Modal title={t("lang.title")} onClose={close} wide>
      <p className="muted small">{describe("courseInfo", "other-languages")}</p>
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
      <div className="row">
        <input className="input" placeholder={t("lang.search")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <input className="input input-small" placeholder={t("lang.region")} value={region} maxLength={2} onChange={(e) => setRegion(e.target.value.replace(/[^a-zA-Z]/g, ""))} />
        <button className="btn btn-primary" disabled={!canAdd(typed)} onClick={() => update((c) => addLanguage(c, typed), "lang-add")}>
          + {typed || "—"}
        </button>
      </div>
      <div className="chips">
        {matches.map(([code, name]) => {
          const full = region ? `${code}-${region.toUpperCase()}` : code;
          return (
            <button key={code} className="chip" disabled={!canAdd(full)} onClick={() => update((c) => addLanguage(c, full), "lang-add")}>
              <strong>{full}</strong> {name}
            </button>
          );
        })}
      </div>
      <p className="field-hint">{t("lang.addHint")}</p>
    </Modal>
  );
}
