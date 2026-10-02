import { useState } from "react";
import { courseLangs, useEditor } from "../store/editor";
import type { Course, CourseNode } from "../schema/types";
import { describe, typeDescription } from "../schema/describe";
import { isJudge, PREFIX, TYPE_STYLE } from "../course/nodeTypes";
import { renameNode } from "../course/ops";
import { localize } from "../course/localize";
import { Field, NumberInput, TextInput } from "../ui/controls";
import { LocalizedField } from "./fields";
import { t } from "../i18n";

/** Edits one node of the course: `edit((node, course) => …, label)`. */
export const useNodeEdit = (id: string) => {
  const update = useEditor((s) => s.update);
  return (fn: (node: CourseNode, course: Course) => void, label: string) =>
    update((c) => {
      const node = c.nodes.find((n) => n.id === id);
      if (node) fn(node, c);
    }, `${id}:${label}`);
};

export function NodeHeader({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const edit = useNodeEdit(node.id);
  const [newId, setNewId] = useState(node.id);
  const style = TYPE_STYLE[node.type];
  const sections = course.info.sections ?? [];
  const isStart = course.info.start === node.id;
  const lang = useEditor((s) => s.canvasLang);
  const idOk = new RegExp(`^${PREFIX[node.type]}[0-9]+$`).test(newId) && !course.nodes.some((n) => n.id === newId && n !== node);

  return (
    <div className="node-header">
      <div className="node-header-top" style={{ "--type-color": style.color } as React.CSSProperties}>
        <span className="type-pill" title={typeDescription(node.type)}>
          {style.icon} {t(`type.${node.type}`)}
        </span>
      </div>
      <p className="type-description">{typeDescription(node.type)}</p>
      <div className="grid-2">
        <Field label="id" help={describe("node", "id")} error={!idOk && newId !== node.id ? t("insp.idInvalid", { prefix: PREFIX[node.type] }) : undefined}>
          <div className="row">
            <TextInput value={newId} onChange={setNewId} pattern={/^[a-z]+[0-9]+$/} />
            {newId !== node.id && (
              <button
                className="btn btn-small"
                disabled={!idOk}
                onClick={() => {
                  update((c) => renameNode(c, node.id, newId), "rename");
                  select({ nodes: [newId], edge: null });
                }}
              >
                {t("insp.rename")}
              </button>
            )}
          </div>
        </Field>
        <Field label={t("insp.section")} help={describe("node", "section")}>
          {sections.length ? (
            <select
              className="input"
              value={node.section ?? 1}
              onChange={(e) =>
                edit((n) => {
                  const v = Number(e.target.value);
                  if (v === 1 && !sections.some((s) => s.number === 1)) delete n.section;
                  else n.section = v;
                }, "section")
              }
            >
              {!sections.some((s) => s.number === (node.section ?? 1)) && <option value={node.section ?? 1}>{node.section ?? 1}</option>}
              {sections.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.number}. {localize(s.title, lang)}
                </option>
              ))}
            </select>
          ) : (
            <NumberInput
              value={node.section ?? 1}
              min={1}
              step={1}
              onChange={(v) =>
                edit((n) => {
                  if (!v || v === 1) delete n.section;
                  else n.section = Math.max(1, Math.round(v));
                }, "section")
              }
            />
          )}
        </Field>
      </div>
      <LocalizedField path={`node:${node.id}/title`} label={t("insp.title")} help={describe("node", "title")} kind="plain" />
      <label className={`check ${isJudge(node.type) ? "is-disabled" : ""}`} title={describe("courseInfo", "start")}>
        <input
          type="checkbox"
          checked={isStart}
          disabled={isJudge(node.type) || isStart}
          onChange={() => update((c) => (c.info.start = node.id), "start")}
        />
        {isJudge(node.type) ? t("insp.judgeNoStart") : t("insp.isStart")}
      </label>
    </div>
  );
}

export const langsOf = (course: Course) => courseLangs(course);
