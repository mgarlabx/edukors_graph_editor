/** What the inspector shows with nothing selected: the course's `info`. */
import { courseLangs, useEditor } from "../store/editor";
import { useUi } from "../store/ui";
import { describe, tip } from "../schema/describe";
import { emptyLoc, isJudge, SCHEMA_URL } from "../course/nodeTypes";
import { localize } from "../course/localize";
import { AutoTextarea, Field, TextInput } from "../ui/controls";
import { emptyLangs, Group, PanelHeader } from "./common";
import { MapIcon } from "../ui/icons";
import { LocalizedField, RowTools, move } from "./fields";
import { ExtrasField } from "./ExtrasField";
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
      <PanelHeader
        kind={t("course.info")}
        icon={<MapIcon size={17} />}
        title={localize(info.title, lang).trim() || <span className="muted">{t("insp.untitled")}</span>}
        langs={emptyLangs(course, null)}
      />
      <div className="insp-groups">
        <Group title={t("insp.group.general")} help={describe("courseInfo")}>
          <LocalizedField path="info/title" label={t("course.title")} help={tip("courseInfo", "title")} kind="plain" />
          <LocalizedField path="info/description" label={t("course.description")} help={tip("courseInfo", "description")} kind="plain" optional minRows={2} />
          <div className="grid-2">
            <Field label={t("course.author")} help={tip("courseInfo", "author")}>
              <TextInput value={info.author ?? ""} onChange={(v) => set((i) => (i.author = v), "author")} />
            </Field>
            <Field label={t("course.version")} help={tip("courseInfo", "version")}>
              <TextInput value={info.version ?? ""} pattern={/^[0-9]+\.[0-9]+\.[0-9]+$/} onChange={(v) => set((i) => (i.version = v), "version")} />
            </Field>
            <Field label={t("course.date")} help={tip("courseInfo", "date")}>
              <input className="input" type="date" value={info.date ?? ""} onChange={(e) => set((i) => (i.date = e.target.value), "date")} />
            </Field>
            <Field label={t("course.start")} help={tip("courseInfo", "start")}>
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
        </Group>
        <Group
          title={t("course.languages")}
          help={tip("courseInfo", "other-languages")}
          count={langs.length}
          actions={
            <button className="btn btn-small" onClick={() => open("languages")}>
              {t("course.manageLanguages")}
            </button>
          }
        >
          <div className="lang-chips">
            {langs.map((l, k) => (
              <span key={l} className={`lang-chip ${k === 0 ? "is-source" : ""}`} title={k === 0 ? t("lang.source") : undefined}>
                {l}
                {k === 0 && " ★"}
              </span>
            ))}
          </div>
        </Group>
        <Group title={t("course.systemPrompt")} help={tip("courseInfo", "system-prompt")}>
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
        </Group>
        <Group title={t("course.sections")} help={tip("courseInfo", "sections")} count={sections.length}>
          {sections.map((s, i) => (
            <div key={i} className="section-row">
              <input
                className="input input-section"
                type="number"
                min={1}
                aria-label={t("course.sectionNumber")}
                title={t("course.sectionNumber")}
                value={s.number}
                onChange={(e) => set((inf) => (inf.sections![i].number = Math.max(1, Math.round(Number(e.target.value) || 1))), `sec${i}-n`)}
              />
              <div className="grow">
                <LocalizedField path={`info/sections/${i}/title`} label="" kind="plain" />
              </div>
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
        </Group>
        <Group title={t("insp.group.advanced")}>
          <Field label="course-id" help={tip("courseInfo", "course-id")}>
            <div className="row">
              <TextInput className="mono grow" value={info["course-id"] ?? ""} onChange={(v) => set((i) => (i["course-id"] = v), "id")} />
              <button className="btn btn-small" onClick={() => set((i) => (i["course-id"] = crypto.randomUUID()), "new-id")} title={t("course.newIdHint")}>
                {t("course.newId")}
              </button>
            </div>
          </Field>
          <ExtrasField
            owner="info"
            value={info.extras}
            help={tip("courseInfo", "extras")}
            onChange={(v) =>
              set((i) => {
                if (v === undefined) delete i.extras;
                else i.extras = v;
              }, "extras")
            }
          />
          <Field label="$schema" help={tip("course", "$schema")}>
            {course.$schema ? (
              <code className="small">{course.$schema}</code>
            ) : (
              <button className="btn btn-small" onClick={() => update((c) => Object.assign(c, { $schema: SCHEMA_URL }), "schema")}>
                + {SCHEMA_URL}
              </button>
            )}
          </Field>
        </Group>
      </div>
    </div>
  );
}
