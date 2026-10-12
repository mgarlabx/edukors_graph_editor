/**
 * The node shapes. The seven types a student sees are cards; choice, score and
 * noul -- which the student only passes through while the AI decides -- are
 * diamonds (plan 5.1).
 */
import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { CourseNode } from "../schema/types";
import { TYPE_STYLE } from "../course/nodeTypes";
import { localize } from "../course/localize";
import { issueText, issueWhere, type Issue } from "../validate";
import { Bubble } from "../ui/controls";
import { t } from "../i18n";

export interface CourseNodeData extends Record<string, unknown> {
  node: CourseNode;
  lang: string;
  isStart: boolean;
  issues: Issue[];
  trail?: "visited" | "current";
}

export type FlowNode = Node<CourseNodeData, "card" | "diamond">;

const Badge = ({ issues }: { issues: Issue[] }) => {
  if (!issues.length) return null;
  const errors = issues.filter((i) => i.level === "error").length;
  return <span className={`node-badge ${errors ? "node-badge-error" : "node-badge-warning"}`}>{errors ? `✖ ${errors}` : `⚠ ${issues.length}`}</span>;
};

/**
 * A node's problems, in a bubble over its card when the pointer rests on it a
 * moment; gone as soon as the pointer leaves, presses or the map moves.
 */
function useIssueBubble(issues: Issue[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("wheel", hide, true);
    return () => window.removeEventListener("wheel", hide, true);
  }, [open]);
  const handlers = issues.length
    ? {
        onMouseEnter: () => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setOpen(true), 350);
        },
        onMouseLeave: hide,
        onPointerDown: hide,
      }
    : {};
  const bubble =
    open && issues.length > 0 && ref.current ? (
      <Bubble anchor={ref.current} className="issue-bubble">
        <ul>
          {[...issues]
            .sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1))
            .map((i, k) => (
              <li key={k}>
                <span className={i.level === "error" ? "is-error" : "is-warning"}>{i.level === "error" ? "✖" : "⚠"}</span> {issueText(i)} <code>{issueWhere(i)}</code>
              </li>
            ))}
        </ul>
      </Bubble>
    ) : null;
  return { ref, handlers, bubble };
}

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
  const tip = useIssueBubble(issues);
  return (
    <div ref={tip.ref} {...tip.handlers} className={`card-node ${status(data, selected)}`} style={{ "--type-color": style.color } as React.CSSProperties}>
      <Handle type="target" position={Position.Top} className="handle" />
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
      {tip.bubble}
      <Handle type="source" position={Position.Bottom} className="handle" />
    </div>
  );
});

export const DiamondNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const { node, lang, issues } = data;
  const style = TYPE_STYLE[node.type] ?? { color: "#888", icon: "?" };
  const title = localize(node.title, lang);
  const tip = useIssueBubble(issues);
  return (
    <div ref={tip.ref} {...tip.handlers} className={`diamond-node ${status(data, selected)}`} style={{ "--type-color": style.color } as React.CSSProperties}>
      <Handle type="target" position={Position.Top} className="handle" />
      <div className="diamond-shape" />
      <div className="diamond-body">
        <span className="type-icon" aria-hidden>
          {style.icon}
        </span>
        <span className="node-id">{node.id}</span>
      </div>
      <div className={`diamond-title ${title ? "" : "is-empty"}`} title={t(`type.${node.type}`)}>
        {title || t("canvas.untitled")}
      </div>
      <Badge issues={issues} />
      {tip.bubble}
      <Handle type="source" position={Position.Bottom} className="handle" />
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
