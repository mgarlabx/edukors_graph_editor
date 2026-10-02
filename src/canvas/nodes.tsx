/**
 * The node shapes. The seven types a student sees are cards; choice, score and
 * noul -- which the student only passes through while the AI decides -- are
 * diamonds (plan 5.1).
 */
import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { CourseNode } from "../schema/types";
import { TYPE_STYLE } from "../course/nodeTypes";
import { localize } from "../course/localize";
import { issueText, issueWhere, type Issue } from "../validate";
import { t } from "../i18n";

export interface CourseNodeData extends Record<string, unknown> {
  node: CourseNode;
  lang: string;
  isStart: boolean;
  issues: Issue[];
  trail?: "visited" | "current";
  forced?: boolean;
}

export type FlowNode = Node<CourseNodeData, "card" | "diamond">;

const Badge = ({ issues }: { issues: Issue[] }) => {
  if (!issues.length) return null;
  const errors = issues.filter((i) => i.level === "error").length;
  const title = issues.map((i) => `${i.level === "error" ? "✖" : "⚠"} ${issueWhere(i)}: ${issueText(i)}`).join("\n");
  return (
    <span className={`node-badge ${errors ? "node-badge-error" : "node-badge-warning"}`} title={title}>
      {errors ? `✖ ${errors}` : `⚠ ${issues.length}`}
    </span>
  );
};

const status = (data: CourseNodeData, selected: boolean) => {
  const errors = data.issues.some((i) => i.level === "error");
  const warnings = !errors && data.issues.length > 0;
  return [
    selected ? "is-selected" : "",
    errors ? "has-error" : warnings ? "has-warning" : "",
    data.trail ? `trail-${data.trail}` : "",
  ].join(" ");
};

export const CardNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const { node, lang, isStart, issues } = data;
  const style = TYPE_STYLE[node.type] ?? { color: "#888", icon: "?" };
  const title = localize(node.title, lang);
  return (
    <div className={`card-node ${status(data, selected)}`} style={{ "--type-color": style.color } as React.CSSProperties}>
      <Handle type="target" position={Position.Left} className="handle" />
      <div className="card-head">
        <span className="type-icon" aria-hidden>
          {style.icon}
        </span>
        <span className="node-id">{node.id}</span>
        <span className="node-type">{t(`type.${node.type}`)}</span>
        {isStart && (
          <span className="start-flag" title={t("canvas.start")}>
            ▶
          </span>
        )}
      </div>
      <div className={`card-title ${title ? "" : "is-empty"}`}>{title || t("canvas.untitled")}</div>
      <Badge issues={issues} />
      <Handle type="source" position={Position.Right} className="handle" />
    </div>
  );
});

export const DiamondNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const { node, lang, issues } = data;
  const style = TYPE_STYLE[node.type] ?? { color: "#888", icon: "?" };
  const title = localize(node.title, lang);
  return (
    <div className={`diamond-node ${status(data, selected)}`} style={{ "--type-color": style.color } as React.CSSProperties}>
      <Handle type="target" position={Position.Left} className="handle" />
      <div className="diamond-shape" />
      <div className="diamond-body">
        <span className="type-icon" aria-hidden>
          {style.icon}
        </span>
        <span className="node-id">{node.id}</span>
        {data.forced && <span className="forced-flag">{t("preview.forced")}</span>}
      </div>
      <div className={`diamond-title ${title ? "" : "is-empty"}`} title={t(`type.${node.type}`)}>
        {title || t("canvas.untitled")}
      </div>
      <Badge issues={issues} />
      <Handle type="source" position={Position.Right} className="handle" />
    </div>
  );
});

export interface SectionData extends Record<string, unknown> {
  number: number;
  title: string;
  width: number;
  height: number;
}

const SECTION_COLORS = ["#4f7cff", "#f08c00", "#2f9e44", "#c05ce0", "#1098ad", "#e8590c", "#d6336c"];

export const sectionColor = (n: number) => SECTION_COLORS[(n - 1) % SECTION_COLORS.length];

export const SectionNode = memo(({ data }: NodeProps<Node<SectionData, "section">>) => (
  <div
    className="section-node"
    style={{ width: data.width, height: data.height, "--section-color": sectionColor(data.number) } as React.CSSProperties}
  >
    <span className="section-label">
      {data.number}. {data.title}
    </span>
  </div>
));

export const nodeTypes = { card: CardNode, diamond: DiamondNode, section: SectionNode };
