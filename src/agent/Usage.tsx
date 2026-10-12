/**
 * The account's usage windows: the line of each window with a bar; the rest
 * of the report only when no window could be read from it. Claude Code words them itself (its /usage
 * report, in English); Codex and Antigravity give the limits, which are worded
 * here, by the group of models that shares them. Read again when shown, unless
 * they were read a moment ago.
 */
import { useEffect } from "react";
import { useAgent } from "./store";
import { groupLimits, splitUsage, type UsageWindow } from "./usageReport";
import type { UsageLimit } from "./events";
import { hasKey, t } from "../i18n";
import { RefreshIcon } from "../ui/icons";

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** When a window resets: the time today, or the day and the time after. */
function resetsAt(at: number): string {
  const when = new Date(at);
  if (when.toDateString() === new Date().toDateString()) return clock(at);
  return when.toLocaleString([], { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** A limit as a line: "Limite de 5 horas: 12% usado · renova 16:46". */
function limitLine(limit: UsageLimit): string {
  const name = hasKey(`agent.usageWindow.${limit.window}`) ? t(`agent.usageWindow.${limit.window}`) : limit.window;
  const used = t("agent.usageUsed", { percent: String(Math.round(limit.percent)) });
  const reset = limit.resetsAt ? ` · ${t("agent.usageResets", { when: resetsAt(limit.resetsAt) })}` : "";
  return `${name}: ${used}${reset}`;
}

function Window({ w }: { w: UsageWindow }) {
  return (
    <div className="agent-usage-window">
      <div className="agent-usage-line">{w.line}</div>
      {w.percent !== undefined && (
        <div className="agent-usage-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.percent} aria-label={w.line}>
          <span className={w.percent >= 90 ? "is-full" : w.percent >= 75 ? "is-high" : ""} style={{ width: `${w.percent}%` }} />
        </div>
      )}
    </div>
  );
}

export function Usage({ compact = false }: { compact?: boolean }) {
  const usage = useAgent((s) => s.usage);
  const state = useAgent((s) => s.usageState);
  const provider = useAgent((s) => s.provider);
  const loadUsage = useAgent((s) => s.loadUsage);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  // The limits, when the provider gives them; else the windows read from the report.
  const groups = usage?.limits?.length ? groupLimits(usage.limits).map((g) => ({ group: g.group, windows: g.limits.map((l) => ({ line: limitLine(l), percent: Math.min(100, Math.max(0, l.percent)) })) })) : null;
  const report = groups ? { windows: [], rest: usage?.text.trim() ?? "" } : splitUsage(usage?.text ?? "");
  const sections = groups ?? (report.windows.length ? [{ group: undefined, windows: report.windows }] : []);
  const rest = sections.length ? "" : report.rest;
  if (compact && !sections.length) return null;
  const named = sections.length > 1 || !!sections[0]?.group;

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
      {sections.map((s, i) => (
        <div key={s.group ?? i} className="agent-usage-group">
          {named && s.group && <div className="agent-usage-group-name">{s.group}</div>}
          {s.windows.map((w) => (
            <Window key={w.line} w={w} />
          ))}
        </div>
      ))}
      {!compact && rest && <pre className="agent-usage-text">{rest}</pre>}
      {!compact && (
        <div className="agent-menu-hint agent-usage-when">
          {state === "loading" ? t("agent.usageLoading") : state === "error" && !usage ? t("agent.usageFailed") : usage ? t(`agent.usageUpdated.${provider}`, { time: clock(usage.at) }) : ""}
        </div>
      )}
    </div>
  );
}
