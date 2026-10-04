/**
 * The edges: numbered in the order the player tries them, a fallback drawn
 * dashed, a condition shown as a label; and the dotted line from a judgement
 * to the node that writes from it (plan 5.1).
 */
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { issueText, type Issue } from "../validate";
import { t } from "../i18n";

export interface FlowEdgeData extends Record<string, unknown> {
  index: number;
  order: number;
  siblings: number;
  label: string;
  fallback: boolean;
  issues: Issue[];
  taken?: boolean;
  reason?: string;
}

export type FlowEdge = Edge<FlowEdgeData, "flow">;

export const FlowEdgeView = memo((props: EdgeProps<FlowEdge>) => {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const back = targetY < sourceY;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: back ? 0.6 : 0.25,
  });
  const errors = data?.issues.some((i) => i.level === "error");
  const warnings = !errors && (data?.issues.length ?? 0) > 0;
  const cls = [
    "flow-edge",
    data?.fallback ? "is-fallback" : "",
    selected ? "is-selected" : "",
    errors ? "has-error" : warnings ? "has-warning" : "",
    data?.taken ? "is-taken" : "",
  ].join(" ");
  const title = [
    data?.fallback ? t("canvas.fallback") : data?.label,
    data?.reason ? `→ ${data.reason}` : "",
    ...(data?.issues ?? []).map((i) => `${i.level === "error" ? "✖" : "⚠"} ${issueText(i)}`),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <>
      <BaseEdge id={props.id} path={path} className={cls} markerEnd={markerEnd} interactionWidth={18} />
      <EdgeLabelRenderer>
        <div
          className={`edge-label ${cls}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title={title}
        >
          {(data?.siblings ?? 0) > 1 && <span className="edge-order">{data!.order}</span>}
          {data?.fallback ? (
            (data?.siblings ?? 0) > 1 && <span className="edge-text muted">{t("canvas.otherwise")}</span>
          ) : (
            <span className="edge-text">{data?.label}</span>
          )}
          {(errors || warnings) && <span className="edge-issue">{errors ? "✖" : "⚠"}</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export const FromEdgeView = memo((props: EdgeProps) => {
  const [path] = getBezierPath({ ...props, curvature: 0.35 });
  return <BaseEdge id={props.id} path={path} className="from-edge" />;
});

export const edgeTypes = { flow: FlowEdgeView, from: FromEdgeView };
