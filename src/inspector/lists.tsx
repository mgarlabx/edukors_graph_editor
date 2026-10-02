/** The forms of quiz and form nodes: lists of questions and fields, each with its options. */
import type { CourseNode } from "../schema/types";
import { describe, enumDescription } from "../schema/describe";
import { emptyLoc } from "../course/nodeTypes";
import { courseLangs, useEditor } from "../store/editor";
import { Field, NumberInput, Section, TextInput } from "../ui/controls";
import { LocalizedField, RowTools, move } from "./fields";
import { useNodeEdit } from "./common";
import { t } from "../i18n";

const NAME = /^[a-z][a-z0-9-]*$/;
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const freeValue = (taken: string[]) => [...LETTERS].find((l) => !taken.includes(l)) ?? `option-${taken.length + 1}`;

type Opt = { value: string; label: unknown; correct?: boolean };

export function QuizForm({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const edit = useNodeEdit(node.id);
  const langs = courseLangs(course);
  const items: Record<string, unknown>[] = Array.isArray(node.content?.items) ? node.content.items : [];
  const base = `node:${node.id}/content/items`;

  return (
    <>
      {items.map((q, i) => {
        const options: Opt[] = Array.isArray(q.options) ? (q.options as Opt[]) : [];
        return (
          <Section
            key={i}
            title={`${t("insp.questionN", { n: i + 1 })}${q.key ? ` · ${q.key}` : ""}`}
            actions={
              <RowTools
                index={i}
                count={items.length}
                onMove={(to) => edit((n) => (n.content.items = move(n.content.items, i, to)), "move-q")}
                onRemove={items.length > 1 ? () => edit((n) => n.content.items.splice(i, 1), "remove-q") : undefined}
              />
            }
          >
            <Field label={t("insp.key")} help={describe("quizQuestion", "key")}>
              <TextInput
                value={String(q.key ?? "")}
                pattern={NAME}
                placeholder={t("insp.optional")}
                onChange={(v) =>
                  edit((n) => {
                    if (v) n.content.items[i].key = v;
                    else delete n.content.items[i].key;
                  }, `q${i}-key`)
                }
              />
            </Field>
            <LocalizedField path={`${base}/${i}/question`} label={t("insp.question")} help={describe("quizQuestion", "question")} kind="markdown" minRows={2} />
            <Field label={t("insp.options")} help={describe("quizQuestion", "options")}>
              <div className="option-list">
                {options.map((o, j) => (
                  <div key={j} className={`option-row ${o.correct ? "is-correct" : ""}`}>
                    <label className="correct" title={describe("quizOption", "correct")}>
                      <input
                        type="radio"
                        name={`${node.id}-q${i}-correct`}
                        checked={o.correct === true}
                        onChange={() => edit((n) => n.content.items[i].options.forEach((x: Opt, k: number) => (x.correct = k === j)), `q${i}-correct`)}
                      />
                      {t("insp.correct")}
                    </label>
                    <TextInput
                      className="input-value"
                      value={o.value ?? ""}
                      pattern={NAME}
                      title={describe("quizOption", "value")}
                      onChange={(v) => edit((n) => (n.content.items[i].options[j].value = v), `q${i}-o${j}-value`)}
                    />
                    <div className="grow">
                      <LocalizedField path={`${base}/${i}/options/${j}/label`} label="" kind="inline" />
                    </div>
                    <RowTools
                      index={j}
                      count={options.length}
                      onMove={(to) => edit((n) => (n.content.items[i].options = move(n.content.items[i].options, j, to)), "move-o")}
                      onRemove={options.length > 2 ? () => edit((n) => n.content.items[i].options.splice(j, 1), "remove-o") : undefined}
                    />
                  </div>
                ))}
                <button
                  className="btn btn-small"
                  onClick={() =>
                    edit(
                      (n) =>
                        n.content.items[i].options.push({
                          value: freeValue(n.content.items[i].options.map((x: Opt) => x.value)),
                          label: emptyLoc(langs),
                          correct: false,
                        }),
                      "add-o",
                    )
                  }
                >
                  + {t("insp.addOption")}
                </button>
              </div>
            </Field>
            <LocalizedField path={`${base}/${i}/feedback`} label={t("insp.feedback")} help={describe("quizQuestion", "feedback")} kind="markdown" optional minRows={2} />
          </Section>
        );
      })}
      <button
        className="btn"
        onClick={() =>
          edit(
            (n) =>
              n.content.items.push({
                question: emptyLoc(langs),
                options: [
                  { value: "a", label: emptyLoc(langs), correct: false },
                  { value: "b", label: emptyLoc(langs), correct: true },
                ],
              }),
            "add-q",
          )
        }
      >
        + {t("insp.addQuestion")}
      </button>
    </>
  );
}

const FIELD_TYPES = ["text-line", "text-area", "radio", "check", "select"];
const CHOICE = ["radio", "check", "select"];

export function FormForm({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const edit = useNodeEdit(node.id);
  const langs = courseLangs(course);
  const items: Record<string, unknown>[] = Array.isArray(node.content?.items) ? node.content.items : [];
  const base = `node:${node.id}/content/items`;

  return (
    <>
      <LocalizedField path={`node:${node.id}/content/instructions`} label={t("insp.instructions")} help={describe("formContent", "instructions")} kind="markdown" optional minRows={5} />
      {items.map((f, i) => {
        const type = String(f.type ?? "text-line");
        const options: Opt[] = Array.isArray(f.options) ? (f.options as Opt[]) : [];
        return (
          <Section
            key={i}
            title={`${t("insp.fieldN", { n: i + 1 })} · ${String(f.key ?? "")}`}
            actions={
              <RowTools
                index={i}
                count={items.length}
                onMove={(to) => edit((n) => (n.content.items = move(n.content.items, i, to)), "move-f")}
                onRemove={items.length > 1 ? () => edit((n) => n.content.items.splice(i, 1), "remove-f") : undefined}
              />
            }
          >
            <div className="grid-2">
              <Field label={t("insp.key")} help={describe("formField", "key")}>
                <TextInput value={String(f.key ?? "")} pattern={NAME} onChange={(v) => edit((n) => (n.content.items[i].key = v), `f${i}-key`)} />
              </Field>
              <Field label={t("insp.fieldType")} help={enumDescription("formField", "type", type) || describe("formField", "type")}>
                <select
                  className="input"
                  value={type}
                  onChange={(e) =>
                    edit((n) => {
                      const field = n.content.items[i];
                      field.type = e.target.value;
                      if (CHOICE.includes(e.target.value)) {
                        delete field["min-words"];
                        delete field["max-words"];
                        if (!Array.isArray(field.options) || field.options.length < 2)
                          field.options = [
                            { value: "a", label: emptyLoc(langs) },
                            { value: "b", label: emptyLoc(langs) },
                          ];
                      } else delete field.options;
                    }, `f${i}-type`)
                  }
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft} value={ft} title={enumDescription("formField", "type", ft)}>
                      {t(`field.${ft}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <LocalizedField path={`${base}/${i}/label`} label={t("insp.label")} help={describe("formField", "label")} kind="inline" />
            <label className="check" title={describe("formField", "required")}>
              <input
                type="checkbox"
                checked={f.required === true}
                onChange={(e) =>
                  edit((n) => {
                    if (e.target.checked) n.content.items[i].required = true;
                    else delete n.content.items[i].required;
                  }, `f${i}-req`)
                }
              />
              {t("insp.required")}
            </label>
            {CHOICE.includes(type) ? (
              <Field label={t("insp.options")} help={describe("formField", "options")}>
                <div className="option-list">
                  {options.map((o, j) => (
                    <div key={j} className="option-row">
                      <TextInput
                        className="input-value"
                        value={o.value ?? ""}
                        pattern={NAME}
                        title={describe("formOption", "value")}
                        onChange={(v) => edit((n) => (n.content.items[i].options[j].value = v), `f${i}-o${j}`)}
                      />
                      <div className="grow">
                        <LocalizedField path={`${base}/${i}/options/${j}/label`} label="" kind="inline" />
                      </div>
                      <RowTools
                        index={j}
                        count={options.length}
                        onMove={(to) => edit((n) => (n.content.items[i].options = move(n.content.items[i].options, j, to)), "move-fo")}
                        onRemove={options.length > 2 ? () => edit((n) => n.content.items[i].options.splice(j, 1), "remove-fo") : undefined}
                      />
                    </div>
                  ))}
                  <button
                    className="btn btn-small"
                    onClick={() =>
                      edit((n) => n.content.items[i].options.push({ value: freeValue(n.content.items[i].options.map((x: Opt) => x.value)), label: emptyLoc(langs) }), "add-fo")
                    }
                  >
                    + {t("insp.addOption")}
                  </button>
                </div>
              </Field>
            ) : (
              <div className="grid-2">
                {(["min-words", "max-words"] as const).map((bound) => (
                  <Field key={bound} label={t(`insp.${bound}`)} help={describe("formField", bound)}>
                    <NumberInput
                      value={f[bound] as number | undefined}
                      min={1}
                      step={1}
                      placeholder={t("insp.optional")}
                      onChange={(v) =>
                        edit((n) => {
                          if (v === undefined) delete n.content.items[i][bound];
                          else n.content.items[i][bound] = Math.max(1, Math.round(v));
                        }, `f${i}-${bound}`)
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
          </Section>
        );
      })}
      <button
        className="btn"
        onClick={() =>
          edit((n) => {
            const taken = n.content.items.map((x: { key?: string }) => x.key);
            let k = 1;
            while (taken.includes(`field-${k}`)) k++;
            n.content.items.push({ key: `field-${k}`, type: "text-line", label: emptyLoc(langs) });
          }, "add-f")
        }
      >
        + {t("insp.addField")}
      </button>
    </>
  );
}
