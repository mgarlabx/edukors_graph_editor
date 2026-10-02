/** What the inspector shows with nothing selected: the course's `info`. */
import { courseLangs, useEditor } from "../store/editor";
import { useUi } from "../store/ui";
import { describe } from "../schema/describe";
import { emptyLoc, isJudge, SCHEMA_URL } from "../course/nodeTypes";
import { localize } from "../course/localize";
import { AutoTextarea, Field, Help, Section, TextInput } from "../ui/controls";
import { LocalizedField, RowTools, move } from "./fields";
import { t } from "../i18n";

export function CourseInfoForm() {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const lang = useEditor((s) => s.canvasLang);
  const open = useUi((s) => s.open);
  const info = course.info ?? ({} as typeof course.info);
  const langs = courseLangs(course);
  const sections = Array.isArray(info.sections) ? info.sections : [];
  const set = (fn: (i: typeof info) => void, label: string) => update((c) => fn(c.info), `info:${label}`);

  return (
    <div className="inspector-body">
      <div className="node-header">
        <div className="node-header-top">
          <span className="type-pill">{t("course.info")}</span>
        </div>
        <p className="type-description">{describe("courseInfo")}</p>
      </div>
      <LocalizedField path="info/title" label={t("course.title")} help={describe("courseInfo", "title")} kind="plain" />
      <LocalizedField path="info/description" label={t("course.description")} help={describe("courseInfo", "description")} kind="plain" optional minRows={2} />
      <div className="grid-2">
        <Field label={t("course.author")} help={describe("courseInfo", "author")}>
          <TextInput value={info.author ?? ""} onChange={(v) => set((i) => (i.author = v), "author")} />
        </Field>
        <Field label={t("course.version")} help={describe("courseInfo", "version")}>
          <TextInput value={info.version ?? ""} pattern={/^[0-9]+\.[0-9]+\.[0-9]+$/} onChange={(v) => set((i) => (i.version = v), "version")} />
        </Field>
        <Field label={t("course.date")} help={describe("courseInfo", "date")}>
          <input className="input" type="date" value={info.date ?? ""} onChange={(e) => set((i) => (i.date = e.target.value), "date")} />
        </Field>
        <Field label={t("course.start")} help={describe("courseInfo", "start")}>
          <select className="input" value={info.start ?? ""} onChange={(e) => set((i) => (i.start = e.target.value), "start")}>
            {!course.nodes.some((n) => n.id === info.start) && <option value={info.start}>{info.start} (?)</option>}
            {course.nodes
              .filter((n) => !isJudge(n.type))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} — {localize(n.title, lang)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <Field label="course-id" help={describe("courseInfo", "course-id")}>
        <div className="row">
          <TextInput className="mono grow" value={info["course-id"] ?? ""} onChange={(v) => set((i) => (i["course-id"] = v), "id")} />
          <button className="btn btn-small" onClick={() => set((i) => (i["course-id"] = crypto.randomUUID()), "new-id")} title={t("course.newIdHint")}>
            {t("course.newId")}
          </button>
        </div>
      </Field>
      <Field label={t("course.languages")} help={describe("courseInfo", "other-languages")}>
        <div className="row">
          <span>
            <strong>{info["source-language"]}</strong> {langs.slice(1).join(", ")}
          </span>
          <span className="spacer" />
          <button className="btn btn-small" onClick={() => open("languages")}>
            {t("course.manageLanguages")}
          </button>
        </div>
      </Field>
      <Field label={t("course.systemPrompt")} help={describe("courseInfo", "system-prompt")}>
        {info["system-prompt"] === undefined ? (
          <button className="btn btn-small" onClick={() => set((i) => (i["system-prompt"] = "Answer in the student's language."), "sp-add")}>
            + {t("insp.add", { what: t("course.systemPrompt") })}
          </button>
        ) : (
          <>
            <AutoTextarea className="mono" minRows={4} value={info["system-prompt"]} onChange={(e) => set((i) => (i["system-prompt"] = e.target.value), "sp")} />
            <button className="link danger" onClick={() => set((i) => delete i["system-prompt"], "sp-remove")}>
              {t("insp.remove")}
            </button>
          </>
        )}
      </Field>
      <Section title={<>{t("course.sections")} <Help text={describe("courseInfo", "sections")} /></>}>
        {sections.map((s, i) => (
          <div key={i} className="section-row">
            <div className="row">
              <label className="muted small">nº</label>
              <input
                className="input input-number"
                type="number"
                min={1}
                value={s.number}
                onChange={(e) => set((inf) => (inf.sections![i].number = Math.max(1, Math.round(Number(e.target.value) || 1))), `sec${i}-n`)}
              />
              <span className="spacer" />
              <RowTools
                index={i}
                count={sections.length}
                onMove={(to) => set((inf) => (inf.sections = move(inf.sections!, i, to)), "sec-move")}
                onRemove={() =>
                  set((inf) => {
                    inf.sections!.splice(i, 1);
                    if (!inf.sections!.length) delete inf.sections;
                  }, "sec-remove")
                }
              />
            </div>
            <LocalizedField path={`info/sections/${i}/title`} label={t("course.sectionTitle", { n: s.number })} kind="plain" />
          </div>
        ))}
        <button
          className="btn btn-small"
          onClick={() =>
            set((inf) => {
              const list = inf.sections ?? [];
              const used = new Set([...list.map((s) => s.number), ...course.nodes.map((n) => n.section ?? 1)]);
              const next = list.length ? Math.max(...list.map((s) => s.number)) + 1 : Math.min(...[...used].filter((n) => !list.some((s) => s.number === n)), 1);
              inf.sections = [...list, { number: next, title: emptyLoc(langs) }];
            }, "sec-add")
          }
        >
          + {t("course.addSection")}
        </button>
      </Section>
      <Field label="$schema" help={describe("course", "$schema")}>
        {course.$schema ? (
          <code className="small">{course.$schema}</code>
        ) : (
          <button className="btn btn-small" onClick={() => update((c) => Object.assign(c, { $schema: SCHEMA_URL }), "schema")}>
            + {SCHEMA_URL}
          </button>
        )}
      </Field>
    </div>
  );
}
