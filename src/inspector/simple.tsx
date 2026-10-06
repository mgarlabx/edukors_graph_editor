/** The forms of static-md, static-html, dynamic-md, dynamic-html and bool nodes. */
import { useEditor } from "../store/editor";
import type { CourseNode } from "../schema/types";
import { describe } from "../schema/describe";
import { isJudge } from "../course/nodeTypes";
import { localize } from "../course/localize";
import { Field } from "../ui/controls";
import { LocalizedField } from "./fields";
import { useNodeEdit } from "./common";
import { t } from "../i18n";

export function StaticForm({ node }: { node: CourseNode }) {
  const html = node.type === "static-html";
  return (
    <LocalizedField
      path={`node:${node.id}/content/item`}
      label={t("insp.content")}
      help={describe(html ? "staticHtmlContent" : "staticMdContent", "item")}
      kind={html ? "html" : "markdown"}
      fullEditor
    />
  );
}

export function DynamicForm({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const lang = useEditor((s) => s.canvasLang);
  const edit = useNodeEdit(node.id);
  const def = node.type === "dynamic-html" ? "dynamicHtmlContent" : "dynamicMdContent";
  const judges = course.nodes.filter((n) => isJudge(n.type));
  return (
    <>
      <LocalizedField path={`node:${node.id}/content/prompt`} label={t("insp.prompt")} help={describe(def, "prompt")} kind="prompt" owner={node.id} fullEditor />
      <Field label={t("insp.from")} help={describe("feedbackFrom")}>
        <select
          className="input"
          value={node.content?.from ?? ""}
          onChange={(e) =>
            edit((n) => {
              if (e.target.value) n.content.from = e.target.value;
              else delete n.content.from;
            }, "from")
          }
        >
          <option value="">{t("insp.fromNone")}</option>
          {judges.map((j) => (
            <option key={j.id} value={j.id}>
              {j.id} — {localize(j.title, lang)}
            </option>
          ))}
          {node.content?.from && !judges.some((j) => j.id === node.content.from) && <option value={node.content.from}>{node.content.from} (?)</option>}
        </select>
      </Field>
      {node.content?.from && <p className="field-hint">{t("insp.fromHint")}</p>}
    </>
  );
}

export function BoolForm({ node }: { node: CourseNode }) {
  const edit = useNodeEdit(node.id);
  const value = node.content?.default;
  return (
    <>
      <LocalizedField path={`node:${node.id}/content/question`} label={t("insp.question")} help={describe("boolContent", "question")} kind="markdown" />
      <div className="grid-2">
        <LocalizedField path={`node:${node.id}/content/yes-label`} label={t("insp.yesLabel")} help={describe("boolContent", "yes-label")} kind="plain" optional />
        <LocalizedField path={`node:${node.id}/content/no-label`} label={t("insp.noLabel")} help={describe("boolContent", "no-label")} kind="plain" optional />
      </div>
      <Field label={t("insp.default")} help={describe("boolContent", "default")}>
        <select
          className="input"
          value={value === undefined ? "" : String(value)}
          onChange={(e) =>
            edit((n) => {
              if (e.target.value === "") delete n.content.default;
              else n.content.default = e.target.value === "true";
            }, "default")
          }
        >
          <option value="">{t("insp.defaultNone")}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </Field>
    </>
  );
}
