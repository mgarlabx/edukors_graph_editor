/**
 * The edges leaving a node, in the order the player tries them, reorderable
 * (plan 5.2); and the inspector of one edge, with its condition.
 */
import type { Condition, CourseNode } from "../schema/types";
import { useEditor } from "../store/editor";
import { describe } from "../schema/describe";
import { summarize } from "../course/condition";
import { localize } from "../course/localize";
import { deleteEdges, outgoingIndexes, reorderEdge } from "../course/ops";
import { keysOfNode, operatorsFor } from "../course/keys";
import { ConditionEditor } from "../conditions/ConditionEditor";
import { Field, Help, Section } from "../ui/controls";
import { RowTools } from "./fields";
import { t } from "../i18n";
import { issueText } from "../validate";

export function OutgoingEdges({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const diagnostics = useEditor((s) => s.diagnostics);
  const lang = useEditor((s) => s.canvasLang);
  const indexes = outgoingIndexes(course, node.id);
  return (
    <Section title={<>{t("edges.outgoing")} <Help text={describe("course", "edges")} /></>}>
      {!indexes.length && <p className="muted">{t("edges.none")}</p>}
      <ol className="edge-list">
        {indexes.map((index, position) => {
          const e = course.edges[index];
          const target = course.nodes.find((n) => n.id === e.to);
          const issues = diagnostics?.byEdge.get(index) ?? [];
          return (
            <li key={index} className={`edge-item ${issues.some((i) => i.level === "error") ? "has-error" : issues.length ? "has-warning" : ""}`}>
              <span className="edge-order">{position + 1}</span>
              <button className="edge-summary link" onClick={() => select({ edge: index, nodes: [] })} title={issues.map(issueText).join("\n")}>
                <span>→ {e.to}</span> <span className="muted">{target ? localize(target.title, lang) : "?"}</span>
                <span className={`edge-when ${e.when ? "" : "is-fallback"}`}>{e.when ? summarize(e.when) : t("edges.fallback")}</span>
              </button>
              <RowTools
                index={position}
                count={indexes.length}
                onMove={(to) => update((c) => reorderEdge(c, node.id, position, to), "reorder")}
                onRemove={() => update((c) => deleteEdges(c, [index]), "delete-edge")}
              />
            </li>
          );
        })}
      </ol>
      <p className="field-hint">{t("edges.orderHint")}</p>
    </Section>
  );
}

export function EdgeInspector({ index }: { index: number }) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const diagnostics = useEditor((s) => s.diagnostics);
  const lang = useEditor((s) => s.canvasLang);
  const edge = course.edges[index];
  if (!edge) return <p className="muted pad">{t("insp.nothing")}</p>;
  const siblings = outgoingIndexes(course, edge.from);
  const position = siblings.indexOf(index);
  const issues = diagnostics?.byEdge.get(index) ?? [];
  const source = course.nodes.find((n) => n.id === edge.from);
  const set = (fn: (e: typeof edge) => void, label: string) =>
    update((c) => {
      if (c.edges[index]) fn(c.edges[index]);
    }, `edge${index}:${label}`);

  const firstCondition = (): Condition => {
    const own = source ? keysOfNode(source, lang)[0] : undefined;
    if (own) return { key: own.key, operator: operatorsFor(own.scale)[0], value: own.scale === "bool" ? true : own.options?.[0] ?? 0 };
    return { key: "", operator: "eq", value: "" };
  };

  return (
    <div className="inspector-body">
      <div className="node-header">
        <div className="node-header-top">
          <span className="type-pill">{t("edges.edge")}</span>
        </div>
        <p className="type-description">{describe("edge")}</p>
      </div>
      {issues.map((i, k) => (
        <div key={k} className={`notice notice-${i.level === "error" ? "error" : "warning"}`}>
          {issueText(i)}
        </div>
      ))}
      <div className="grid-2">
        <Field label={t("edges.from")} help={describe("edge", "from")}>
          <button className="btn wide" onClick={() => select({ nodes: [edge.from], edge: null })}>
            {edge.from} — {source ? localize(source.title, lang) : "?"}
          </button>
        </Field>
        <Field label={t("edges.to")} help={describe("edge", "to")}>
          <select className="input" value={edge.to} onChange={(e) => set((x) => (x.to = e.target.value), "to")}>
            {!course.nodes.some((n) => n.id === edge.to) && <option value={edge.to}>{edge.to} (?)</option>}
            {course.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} — {localize(n.title, lang)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t("edges.position")} help={t("edges.orderHint")}>
        <div className="row">
          <span>
            {position + 1} / {siblings.length}
          </span>
          <RowTools index={position} count={siblings.length} onMove={(to) => update((c) => reorderEdge(c, edge.from, position, to), "reorder")} />
        </div>
      </Field>
      <Field label={t("edges.condition")} help={describe("edge", "when")}>
        {edge.when ? (
          <>
            <ConditionEditor value={edge.when} onChange={(c) => set((x) => (x.when = c), "when")} />
            <button className="link danger" onClick={() => set((x) => delete x.when, "fallback")}>
              {t("edges.makeFallback")}
            </button>
          </>
        ) : (
          <>
            <p className="muted">{t("edges.isFallback")}</p>
            <button className="btn btn-small" onClick={() => set((x) => (x.when = firstCondition()), "add-when")}>
              + {t("edges.addCondition")}
            </button>
          </>
        )}
      </Field>
    </div>
  );
}
