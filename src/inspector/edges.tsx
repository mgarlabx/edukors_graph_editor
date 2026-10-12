/**
 * The edges leaving a node, in the order the player tries them, reorderable
 * (plan 5.2); and the inspector of one edge, with its condition.
 */
import type { Condition, CourseNode } from "../schema/types";
import { useEditor } from "../store/editor";
import { describe, tip } from "../schema/describe";
import { summarize } from "../course/condition";
import { localize } from "../course/localize";
import { deleteEdges, outgoingIndexes, reorderEdge } from "../course/ops";
import { keysOfNode, operatorsFor } from "../course/keys";
import { ConditionEditor } from "../conditions/ConditionEditor";
import { Field } from "../ui/controls";
import { Group, PanelHeader } from "./common";
import { ExtrasField } from "./ExtrasField";
import { RowTools } from "./fields";
import { t } from "../i18n";

export function OutgoingEdges({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const lang = useEditor((s) => s.canvasLang);
  const indexes = outgoingIndexes(course, node.id);
  return (
    <Group title={t("insp.group.exits")} help={`${t("edges.outgoing")}. ${tip("course", "edges")}`} count={indexes.length}>
      {!indexes.length && <p className="muted small">{t("edges.none")}</p>}
      <ol className="edge-list">
        {indexes.map((index, position) => {
          const e = course.edges[index];
          const target = course.nodes.find((n) => n.id === e.to);
          return (
            <li key={index} className="edge-item">
              <span className="edge-order">{position + 1}</span>
              <button className="edge-summary" onClick={() => select({ edge: index, nodes: [] })}>
                <span className="edge-target">
                  <code>{e.to}</code> <span className="edge-target-title">{target ? localize(target.title, lang) : "?"}</span>
                </span>
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
      {indexes.length > 1 && <p className="field-hint">{t("edges.orderHint")}</p>}
    </Group>
  );
}

export function EdgeInspector({ index }: { index: number }) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const lang = useEditor((s) => s.canvasLang);
  const edge = course.edges[index];
  if (!edge) return <p className="muted pad">{t("insp.nothing")}</p>;
  const siblings = outgoingIndexes(course, edge.from);
  const position = siblings.indexOf(index);
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

  const target = course.nodes.find((n) => n.id === edge.to);
  return (
    <div className="inspector-body">
      <PanelHeader
        kind={t("edges.edge")}
        icon="→"
        title={
          <span className="edge-title">
            <code>{edge.from}</code> → <code>{edge.to}</code>
          </span>
        }
      />
      <div className="insp-groups">
        <Group title={t("insp.group.connection")} help={describe("edge")}>
          <Field label={t("edges.from")} help={tip("edge", "from")}>
            <button className="btn wide edge-from" onClick={() => select({ nodes: [edge.from], edge: null })} title={t("insp.goToNode")}>
              <code>{edge.from}</code> <span className="muted">{source ? localize(source.title, lang) : "?"}</span>
            </button>
          </Field>
          <Field label={t("edges.to")} help={tip("edge", "to")}>
            <div className="row">
              <select className="input grow" value={edge.to} onChange={(e) => set((x) => (x.to = e.target.value), "to")}>
                {!course.nodes.some((n) => n.id === edge.to) && <option value={edge.to}>{edge.to} (?)</option>}
                {course.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id} — {localize(n.title, lang)}
                  </option>
                ))}
              </select>
              <button className="btn btn-small" disabled={!target} onClick={() => select({ nodes: [edge.to], edge: null })} title={t("insp.goToNode")}>
                →
              </button>
            </div>
          </Field>
          <Field label={t("edges.position")} help={t("edges.orderHint")}>
            <div className="row">
              <span className="edge-order">{position + 1}</span>
              <span className="muted small">/ {siblings.length}</span>
              <span className="spacer" />
              <RowTools index={position} count={siblings.length} onMove={(to) => update((c) => reorderEdge(c, edge.from, position, to), "reorder")} />
            </div>
          </Field>
        </Group>
        <Group title={t("edges.condition")} help={tip("edge", "when")}>
          {edge.when ? (
            <>
              <ConditionEditor value={edge.when} onChange={(c) => set((x) => (x.when = c), "when")} />
              <button className="link danger" onClick={() => set((x) => delete x.when, "fallback")}>
                {t("edges.makeFallback")}
              </button>
            </>
          ) : (
            <>
              <p className="muted small">{t("edges.isFallback")}</p>
              <button className="btn btn-small" onClick={() => set((x) => (x.when = firstCondition()), "add-when")}>
                + {t("edges.addCondition")}
              </button>
            </>
          )}
        </Group>
        <Group>
          <ExtrasField
            owner={`edge-${index}`}
            value={edge.extras}
            help={tip("edge", "extras")}
            onChange={(v) =>
              set((x) => {
                if (v === undefined) delete x.extras;
                else x.extras = v;
              }, "extras")
            }
          />
        </Group>
      </div>
    </div>
  );
}
