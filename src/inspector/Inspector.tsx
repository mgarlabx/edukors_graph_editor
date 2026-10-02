import type { ReactNode } from "react";
import { useEditor } from "../store/editor";
import { usePrefs } from "../store/prefs";
import { useResizable } from "../ui/resize";
import { NodeHeader } from "./common";
import { BoolForm, DynamicForm, StaticForm } from "./simple";
import { FormForm, QuizForm } from "./lists";
import { JudgeForm } from "./judge";
import { CourseInfoForm } from "./course";
import { EdgeInspector, OutgoingEdges } from "./edges";
import { isJudge } from "../course/nodeTypes";
import { t } from "../i18n";
import { issueText, issueWhere } from "../validate";

/** The panel itself, its left edge dragged to set its width, which the preferences keep. */
function Shell({ children }: { children: ReactNode }) {
  const saved = usePrefs((s) => s.sidebar.inspector);
  const { width, handle } = useResizable(saved, 300, 760, (w) =>
    usePrefs.getState().save({ sidebar: { ...usePrefs.getState().sidebar, inspector: w } }),
  );
  return (
    <aside className="inspector" style={{ width }} aria-label={t("insp.panel")}>
      {handle}
      {children}
    </aside>
  );
}

export function Inspector() {
  const course = useEditor((s) => s.course);
  const selection = useEditor((s) => s.selection);
  const diagnostics = useEditor((s) => s.diagnostics);

  if (!course) return null;
  if (selection.edge !== null && !selection.nodes.length)
    return (
      <Shell>
        <EdgeInspector index={selection.edge} />
      </Shell>
    );
  if (selection.nodes.length > 1)
    return (
      <Shell>
        <p className="pad muted">{t("insp.many", { n: selection.nodes.length })}</p>
      </Shell>
    );
  const node = selection.nodes.length === 1 ? course.nodes.find((n) => n.id === selection.nodes[0]) : undefined;
  if (!node)
    return (
      <Shell>
        <CourseInfoForm />
      </Shell>
    );

  const issues = diagnostics?.byNode.get(node.id) ?? [];
  return (
    <Shell>
      <div className="inspector-body" key={node.id}>
        <NodeHeader node={node} />
        {issues.length > 0 && (
          <details className="issue-box" open={issues.some((i) => i.level === "error")}>
            <summary>
              {issues.filter((i) => i.level === "error").length} ✖ · {issues.filter((i) => i.level === "warning").length} ⚠
            </summary>
            {issues.map((i, k) => (
              <div key={k} className={`notice notice-${i.level === "error" ? "error" : "warning"}`}>
                <code>{issueWhere(i)}</code> {issueText(i)}
              </div>
            ))}
          </details>
        )}
        {(node.type === "static-md" || node.type === "static-html") && <StaticForm node={node} />}
        {(node.type === "dynamic-md" || node.type === "dynamic-html") && <DynamicForm node={node} />}
        {node.type === "quiz" && <QuizForm node={node} />}
        {node.type === "form" && <FormForm node={node} />}
        {node.type === "bool" && <BoolForm node={node} />}
        {isJudge(node.type) && <JudgeForm node={node} />}
        <OutgoingEdges node={node} />
      </div>
    </Shell>
  );
}
