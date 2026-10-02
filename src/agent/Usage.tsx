/**
 * The account's usage windows, in Claude Code's own words (its /usage report,
 * in English): the line of each window with a bar, and the rest of the report
 * under Details. Read again when shown, unless it was read a moment ago.
 */
import { useEffect } from "react";
import { useAgent } from "./store";
import { splitUsage } from "./usageReport";
import { t } from "../i18n";
import { RefreshIcon } from "../ui/icons";

export function Usage({ compact = false }: { compact?: boolean }) {
  const usage = useAgent((s) => s.usage);
  const state = useAgent((s) => s.usageState);
  const loadUsage = useAgent((s) => s.loadUsage);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const { windows, rest } = splitUsage(usage?.text ?? "");
  if (compact && !windows.length) return null;
  const time = usage ? new Date(usage.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className={`agent-usage ${compact ? "is-compact" : ""}`} aria-live="polite">
      {!compact && (
        <div className="agent-menu-label agent-usage-head">
          <span>{t("agent.usage")}</span>
          <button type="button" className="agent-icon-btn" onClick={() => void loadUsage(true)} disabled={state === "loading"} title={t("agent.usageRefresh")} aria-label={t("agent.usageRefresh")}>
            <RefreshIcon size={13} className={`icon ${state === "loading" ? "agent-spin" : ""}`} />
          </button>
        </div>
      )}
      {windows.map((w) => (
        <div key={w.line} className="agent-usage-window">
          <div className="agent-usage-line">{w.line}</div>
          {w.percent !== undefined && (
            <div className="agent-usage-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.percent} aria-label={w.line}>
              <span className={w.percent >= 90 ? "is-full" : w.percent >= 75 ? "is-high" : ""} style={{ width: `${w.percent}%` }} />
            </div>
          )}
        </div>
      ))}
      {!compact && rest && (windows.length ? (
        <details className="agent-usage-more">
          <summary>{t("agent.details")}</summary>
          <pre>{rest}</pre>
        </details>
      ) : (
        <pre className="agent-usage-text">{rest}</pre>
      ))}
      {!compact && (
        <div className="agent-menu-hint agent-usage-when">
          {state === "loading" ? t("agent.usageLoading") : state === "error" && !usage ? t("agent.usageFailed") : usage ? t("agent.usageUpdated", { time }) : ""}
        </div>
      )}
    </div>
  );
}
