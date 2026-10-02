/**
 * choice, score and noul (plan 5.2): the state as named fields, the questions
 * with their keys and instructions, and what an answer may be -- the options of
 * a choice, the ordered levels (and points) of a score, the optional yes/no of
 * a noul. For a writing task, the form's assignment sits beside the state.
 */
import { useMemo } from "react";
import type { CourseNode } from "../schema/types";
import { describe } from "../schema/describe";
import { storageKeys, localize } from "../course/localize";
import { useEditor } from "../store/editor";
import { hashText } from "../store/layout";
import { useUi } from "../store/ui";
import { Field, Help, IconButton, NumberInput, Section, TextInput } from "../ui/controls";
import { RichPreview, RowTools, StorageTextarea, move } from "./fields";
import { useNodeEdit } from "./common";
import { t } from "../i18n";

const NAME = /^[a-z][a-z0-9-]*$/;
const DEF = { choice: "choiceContent", score: "scoreContent", noul: "noulContent" } as Record<string, string>;
const QDEF = { choice: "choiceQuestion", score: "scoreQuestion", noul: "noulQuestion" } as Record<string, string>;

export function JudgeForm({ node }: { node: CourseNode }) {
  const edit = useNodeEdit(node.id);
  const items: Record<string, unknown>[] = Array.isArray(node.content?.items) ? node.content.items : [];
  const open = useUi((s) => s.open);
  return (
    <>
      <div className="row">
        <button className="btn btn-primary" onClick={() => open("probe", node.id)}>
          ⚗ {t("probe.open")}
        </button>
      </div>
      <WritingTaskPair node={node} />
      <StateEditor node={node} />
      {items.map((item, i) => (
        <Section
          key={i}
          title={`${t("insp.questionN", { n: i + 1 })} · ${String(item.key ?? "")}`}
          actions={
            <RowTools
              index={i}
              count={items.length}
              onMove={(to) => edit((n) => (n.content.items = move(n.content.items, i, to)), "move-j")}
              onRemove={items.length > 1 ? () => edit((n) => n.content.items.splice(i, 1), "remove-j") : undefined}
            />
          }
        >
          <Field label={t("insp.key")} help={describe("judgeKey")}>
            <TextInput value={String(item.key ?? "")} pattern={NAME} onChange={(v) => edit((n) => (n.content.items[i].key = v), `j${i}-key`)} />
          </Field>
          <Field label={t("insp.judgeInstructions")} help={describe("judgeInstructions")}>
            <StorageTextarea
              value={String(item.instructions ?? "")}
              minRows={3}
              owner={node.id}
              onChange={(v) => edit((n) => (n.content.items[i].instructions = v), `j${i}-instr`)}
            />
          </Field>
          {node.type === "choice" && <ChoiceCriteria node={node} index={i} />}
          {node.type === "score" && <ScoreCriteria node={node} index={i} />}
          {node.type === "noul" && <NoulCriteria node={node} index={i} />}
        </Section>
      ))}
      <button
        className="btn"
        onClick={() =>
          edit((n) => {
            const taken = n.content.items.map((x: { key?: string }) => x.key);
            let k = 1;
            while (taken.includes(`question-${k}`)) k++;
            const fresh: Record<string, unknown> = { key: `question-${k}`, instructions: "" };
            if (n.type === "choice") fresh.criteria = { yes: null, no: null, unclear: null };
            if (n.type === "score") fresh.criteria = ["", "", ""];
            n.content.items.push(fresh);
          }, "add-j")
        }
      >
        + {t("insp.addQuestion")}
      </button>
    </>
  );
}

function StateEditor({ node }: { node: CourseNode }) {
  const edit = useNodeEdit(node.id);
  const state: Record<string, string | string[]> = node.content?.state && typeof node.content.state === "object" ? node.content.state : {};
  const entries = Object.entries(state);
  /** Rewrites the state with the entries in a new order or shape, keeping the object's key order. */
  const rewrite = (fn: (list: [string, string | string[]][]) => [string, string | string[]][], label: string) =>
    edit((n) => (n.content.state = Object.fromEntries(fn(Object.entries(n.content.state ?? {})))), label);

  return (
    <Section title={<>{t("insp.state")} <Help text={describe("judgeState")} /></>}>
      {entries.map(([name, value], i) => (
        <div key={i} className="state-row">
          <div className="row">
            <TextInput
              className="input-value"
              value={name}
              pattern={NAME}
              onChange={(v) => rewrite((list) => (list.some((e, k) => k !== i && e[0] === v) ? list : list.map((e, k) => (k === i ? [v, e[1]] : e))), `state-name-${i}`)}
            />
            <label className="check small" title={t("insp.stateListHint")}>
              <input
                type="checkbox"
                checked={Array.isArray(value)}
                onChange={(e) =>
                  rewrite(
                    (list) => list.map((x, k) => (k === i ? [x[0], e.target.checked ? [String(x[1])] : (x[1] as string[]).join("\n")] : x)),
                    `state-kind-${i}`,
                  )
                }
              />
              {t("insp.stateList")}
            </label>
            <span className="spacer" />
            <RowTools
              index={i}
              count={entries.length}
              onMove={(to) => rewrite((list) => move(list, i, to), "state-move")}
              onRemove={entries.length > 1 ? () => rewrite((list) => list.filter((_, k) => k !== i), "state-remove") : undefined}
            />
          </div>
          {Array.isArray(value) ? (
            <div className="state-list">
              {value.map((part, j) => (
                <div key={j} className="row">
                  <StorageTextarea
                    value={part}
                    minRows={1}
                    owner={node.id}
                    onChange={(v) => rewrite((list) => list.map((x, k) => (k === i ? [x[0], (x[1] as string[]).map((p, q) => (q === j ? v : p))] : x)), `state-${i}-${j}`)}
                  />
                  <IconButton title={t("insp.remove")} onClick={() => rewrite((list) => list.map((x, k) => (k === i ? [x[0], (x[1] as string[]).filter((_, q) => q !== j)] : x)), "state-part-remove")}>
                    ×
                  </IconButton>
                </div>
              ))}
              <button className="btn btn-small" onClick={() => rewrite((list) => list.map((x, k) => (k === i ? [x[0], [...(x[1] as string[]), ""]] : x)), "state-part-add")}>
                + {t("insp.addText")}
              </button>
            </div>
          ) : (
            <StorageTextarea value={String(value)} minRows={2} owner={node.id} onChange={(v) => rewrite((list) => list.map((x, k) => (k === i ? [x[0], v] : x)), `state-${i}`)} />
          )}
        </div>
      ))}
      <button
        className="btn btn-small"
        onClick={() =>
          rewrite((list) => {
            let k = 1;
            while (list.some(([n]) => n === `field-${k}`)) k++;
            return [...list, [`field-${k}`, ""]];
          }, "state-add")
        }
      >
        + {t("insp.addStateField")}
      </button>
    </Section>
  );
}

function ChoiceCriteria({ node, index }: { node: CourseNode; index: number }) {
  const edit = useNodeEdit(node.id);
  const criteria: Record<string, string | null> = node.content.items[index]?.criteria ?? {};
  const entries = Object.entries(criteria);
  const rewrite = (fn: (list: [string, string | null][]) => [string, string | null][], label: string) =>
    edit((n) => (n.content.items[index].criteria = Object.fromEntries(fn(Object.entries(n.content.items[index].criteria ?? {})))), label);
  return (
    <Field label={t("insp.choiceOptions")} help={describe("choiceQuestion", "criteria")}>
      <div className="option-list">
        {entries.map(([name, what], j) => (
          <div key={j} className="option-row">
            <TextInput className="input-value" value={name} pattern={NAME} onChange={(v) => rewrite((l) => (l.some((x, k) => k !== j && x[0] === v) ? l : l.map((x, k) => (k === j ? [v, x[1]] : x))), `c${index}-name-${j}`)} />
            <input
              className="input grow"
              value={what ?? ""}
              disabled={what === null}
              placeholder={what === null ? t("insp.noDescription") : ""}
              onChange={(e) => rewrite((l) => l.map((x, k) => (k === j ? [x[0], e.target.value] : x)), `c${index}-what-${j}`)}
            />
            <label className="check small" title={t("insp.nullHint")}>
              <input type="checkbox" checked={what === null} onChange={(e) => rewrite((l) => l.map((x, k) => (k === j ? [x[0], e.target.checked ? null : ""] : x)), `c${index}-null-${j}`)} />
              null
            </label>
            <RowTools
              index={j}
              count={entries.length}
              onMove={(to) => rewrite((l) => move(l, j, to), "c-move")}
              onRemove={entries.length > 2 ? () => rewrite((l) => l.filter((_, k) => k !== j), "c-remove") : undefined}
            />
          </div>
        ))}
        <button
          className="btn btn-small"
          disabled={entries.length >= 255}
          onClick={() =>
            rewrite((l) => {
              let k = 1;
              while (l.some(([n]) => n === `option-${k}`)) k++;
              return [...l, [`option-${k}`, ""]];
            }, "c-add")
          }
        >
          + {t("insp.addOption")}
        </button>
        {!entries.some(([n]) => n === "unclear") && <p className="field-hint">{t("insp.unclearHint")}</p>}
      </div>
    </Field>
  );
}

function ScoreCriteria({ node, index }: { node: CourseNode; index: number }) {
  const edit = useNodeEdit(node.id);
  const item = node.content.items[index] ?? {};
  const levels: string[] = Array.isArray(item.criteria) ? item.criteria : [];
  const points: number[] | undefined = Array.isArray(item.points) ? item.points : undefined;
  const set = (fn: (it: { criteria: string[]; points?: number[] }) => void, label: string) => edit((n) => fn(n.content.items[index]), label);
  return (
    <Field label={t("insp.levels")} help={describe("scoreQuestion", "criteria")}>
      <label className="check small" title={describe("scoreQuestion", "points")}>
        <input
          type="checkbox"
          checked={Boolean(points)}
          onChange={(e) =>
            set((it) => {
              if (e.target.checked) it.points = it.criteria.map((_, k) => Math.round((k * 100) / Math.max(1, it.criteria.length - 1)));
              else delete it.points;
            }, `s${index}-points-toggle`)
          }
        />
        {t("insp.points")}
      </label>
      <ol className="level-list" start={0}>
        {levels.map((level, j) => (
          <li key={j} className="level-row">
            <span className="level-number">{j}</span>
            <input className="input grow" value={level} onChange={(e) => set((it) => (it.criteria[j] = e.target.value), `s${index}-l${j}`)} />
            {points && (
              <NumberInput
                className="input-points"
                value={points[j]}
                min={0}
                onChange={(v) => set((it) => ((it.points as number[])[j] = v ?? 0), `s${index}-p${j}`)}
              />
            )}
            <RowTools
              index={j}
              count={levels.length}
              onMove={(to) =>
                set((it) => {
                  it.criteria = move(it.criteria, j, to);
                  if (it.points) it.points = move(it.points, j, to);
                }, "s-move")
              }
              onRemove={
                levels.length > 2
                  ? () =>
                      set((it) => {
                        it.criteria.splice(j, 1);
                        it.points?.splice(j, 1);
                      }, "s-remove")
                  : undefined
              }
            />
          </li>
        ))}
      </ol>
      <button
        className="btn btn-small"
        disabled={levels.length >= 10}
        onClick={() =>
          set((it) => {
            it.criteria.push("");
            if (it.points) it.points.push(Math.max(0, ...it.points));
          }, "s-add")
        }
      >
        + {t("insp.addLevel")}
      </button>
      <p className="field-hint">{t("insp.levelHint", { max: Math.max(0, levels.length - 1) })}</p>
    </Field>
  );
}

function NoulCriteria({ node, index }: { node: CourseNode; index: number }) {
  const edit = useNodeEdit(node.id);
  const criteria: { true?: string; false?: string } | undefined = node.content.items[index]?.criteria;
  if (!criteria)
    return (
      <Field label={t("insp.noulCriteria")} help={describe("noulQuestion", "criteria")}>
        <button className="btn btn-small" onClick={() => edit((n) => (n.content.items[index].criteria = { true: "", false: "" }), "n-add")}>
          + {t("insp.add", { what: t("insp.noulCriteria") })}
        </button>
      </Field>
    );
  return (
    <Field label={t("insp.noulCriteria")} help={describe("noulQuestion", "criteria")}>
      {(["true", "false"] as const).map((side) => (
        <div key={side} className="row">
          <code className="level-number">{side}</code>
          <input className="input grow" value={criteria[side] ?? ""} onChange={(e) => edit((n) => (n.content.items[index].criteria[side] = e.target.value), `n${index}-${side}`)} />
        </div>
      ))}
      <button className="link danger" onClick={() => edit((n) => delete n.content.items[index].criteria, "n-remove")}>
        {t("insp.remove")}
      </button>
    </Field>
  );
}

/**
 * A writing task, side by side (plan 5.2): the form's assignment next to the
 * state that judges it, with a warning when one changed and the other did not
 * since the author last marked them as matching.
 */
function WritingTaskPair({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const pairs = useEditor((s) => s.layout.pairs);
  const setLayout = useEditor((s) => s.setLayout);
  const lang = course.info["source-language"];
  const stateText = JSON.stringify(node.content?.state ?? {});
  const forms = useMemo(() => {
    const read = new Set(Object.values(node.content?.state ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v])).flatMap((v) => storageKeys(String(v))).map((k) => k.split(".")[0]));
    return course.nodes.filter((n) => n.type === "form" && read.has(n.id) && Array.isArray(n.content?.instructions));
  }, [course, node]);
  if (!forms.length) return null;
  return (
    <>
      {forms.map((form) => {
        const instructions = localize(form.content.instructions, lang);
        const id = `${node.id}|${form.id}`;
        const now = { form: hashText(instructions), state: hashText(stateText) };
        const was = pairs?.[id];
        const formChanged = was && was.form !== now.form;
        const stateChanged = was && was.state !== now.state;
        const drift = Boolean(was) && formChanged !== stateChanged;
        return (
          <Section key={form.id} title={t("pair.title", { form: form.id })} open={drift}>
            {drift && <div className="notice notice-warning">{formChanged ? t("pair.formChanged", { form: form.id }) : t("pair.stateChanged", { form: form.id })}</div>}
            <div className="pair">
              <div>
                <div className="field-label">{t("pair.assignment", { form: form.id })}</div>
                <RichPreview kind="markdown" text={instructions} />
              </div>
              <div>
                <div className="field-label">{t("pair.state")}</div>
                <pre className="state-pre">{Object.entries(node.content.state ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" | ") : v}`).join("\n\n")}</pre>
              </div>
            </div>
            <button
              className="btn btn-small"
              disabled={was?.form === now.form && was?.state === now.state}
              onClick={() => setLayout((l) => (l.pairs = { ...(l.pairs ?? {}), [id]: now }))}
            >
              ✓ {t("pair.mark")}
            </button>
          </Section>
        );
      })}
    </>
  );
}

export { DEF as JUDGE_DEF, QDEF as JUDGE_QDEF };
