/** Every error and warning, with a click to the node or edge it points at (plan 5.4). */
import { useState } from "react";
import { useEditor } from "../store/editor";
import { asScriptLines } from "./rules";
import { issueText, issueWhere } from ".";
import { t } from "../i18n";

export function ProblemsPanel() {
  const diagnostics = useEditor((s) => s.diagnostics);
  const reveal = useEditor((s) => s.reveal);
  const select = useEditor((s) => s.select);
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all");
  if (!diagnostics) return null;
  const list = diagnostics.issues.filter((i) => filter === "all" || i.level === filter);
  return (
    <div className="bottom-panel">
      <div className="bottom-bar">
        <div className="segmented">
          {(["all", "error", "warning"] as const).map((f) => (
            <button key={f} className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
              {t(`problems.${f}`)}
              {f === "error" ? ` (${diagnostics.errors})` : f === "warning" ? ` (${diagnostics.warnings})` : ""}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="link small" onClick={() => navigator.clipboard?.writeText(asScriptLines(diagnostics.issues).join("\n"))} title={t("problems.copyHint")}>
          {t("problems.copy")}
        </button>
      </div>
      {!list.length ? (
        <p className="pad muted">{diagnostics.errors + diagnostics.warnings === 0 ? t("problems.clean") : t("problems.noneHere")}</p>
      ) : (
        <ul className="problem-list">
          {list.map((i, k) => (
            <li key={k}>
              <button
                className={`problem problem-${i.level}`}
                onClick={() => {
                  if (i.node) reveal({ node: i.node });
                  else if (i.edge !== undefined) reveal({ edge: i.edge });
                  else if (i.where.startsWith("info") || i.where === "translations") select({ nodes: [], edge: null });
                }}
              >
                <span className="problem-icon">{i.level === "error" ? "✖" : "⚠"}</span>
                <code className="problem-where">{issueWhere(i)}</code>
                <span className="problem-message">{issueText(i)}</span>
                {i.source === "schema" && <span className="pill">schema</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
