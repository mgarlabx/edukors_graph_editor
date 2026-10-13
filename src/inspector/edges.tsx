/** The inspector of one edge: where it goes, its place among its siblings, its condition. */
import type { Condition } from "../schema/types";
import { useEditor } from "../store/editor";
import { describe, tip } from "../schema/describe";
import { localize } from "../course/localize";
import { outgoingIndexes, reorderEdge } from "../course/ops";
import { keysOfNode, operatorsFor } from "../course/keys";
import { ConditionEditor } from "../conditions/ConditionEditor";
import { Field } from "../ui/controls";
import { Group, PanelHeader, Tab } from "./common";
import { ExtrasField } from "./ExtrasField";
import { RowTools } from "./fields";
import { t } from "../i18n";

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
      <Tab id="data">
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
      </Tab>
      <Tab id="spec">
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
      </Tab>
      <Tab id="extras">
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
      </Tab>
    </div>
  );
}
