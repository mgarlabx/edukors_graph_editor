import type { ReactNode } from "react";
import { useEditor } from "../store/editor";
import { usePrefs } from "../store/prefs";
import { useResizable } from "../ui/resize";
import { Group, NodeAdvanced, NodeGeneral, NodeHeader, Part, Tab } from "./common";
import { BoolForm, DynamicForm, StaticForm } from "./simple";
import { FormForm, QuizForm } from "./lists";
import { JudgeForm } from "./judge";
import { CourseInfoForm } from "./course";
import { EdgeInspector } from "./edges";
import { isJudge, TYPE_STYLE } from "../course/nodeTypes";
import { typeDescription } from "../schema/describe";
import { t } from "../i18n";

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
        <div className="insp-empty">
          <strong>{t("insp.manyTitle")}</strong>
          <p className="muted">{t("insp.many", { n: selection.nodes.length })}</p>
        </div>
      </Shell>
    );
  const node = selection.nodes.length === 1 ? course.nodes.find((n) => n.id === selection.nodes[0]) : undefined;
  if (!node)
    return (
      <Shell>
        <CourseInfoForm />
      </Shell>
    );

  const style = TYPE_STYLE[node.type];
  return (
    <Shell>
      <div className="inspector-body" key={node.id}>
        <NodeHeader node={node} />
        <Tab id="data">
          <NodeGeneral node={node} />
        </Tab>
        <Tab id="spec">
          <Part icon={style.icon} color={style.color} title={t(`type.${node.type}`)} tags={[node.type]} description={typeDescription(node.type)}>
            {(node.type === "static-md" || node.type === "static-html") && (
              <Group>
                <StaticForm node={node} />
              </Group>
            )}
            {(node.type === "dynamic-md" || node.type === "dynamic-html") && (
              <Group>
                <DynamicForm node={node} />
              </Group>
            )}
            {node.type === "bool" && (
              <Group>
                <BoolForm node={node} />
              </Group>
            )}
            {node.type === "quiz" && <QuizForm node={node} />}
            {node.type === "form" && <FormForm node={node} />}
            {isJudge(node.type) && <JudgeForm node={node} />}
          </Part>
        </Tab>
        <Tab id="extras">
          <NodeAdvanced node={node} />
        </Tab>
      </div>
    </Shell>
  );
}
