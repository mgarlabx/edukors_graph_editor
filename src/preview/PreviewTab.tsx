/**
 * The course as the student will see it, with real inference (plan 5.5), and
 * beside it what the author needs to tune it: every call, the student's state,
 * the path and why each branch was taken, and a way to force a judgement.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { courseLangs, useEditor } from "../store/editor";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { useResizable } from "../ui/resize";
import { currentState, usePreview, type CallLog, type PlayerState } from "./session";
import { previewHtml } from "./shim";
import { answer } from "./host";
import { chooseEdge, summarize } from "../course/condition";
import { keysOfCourse, scaleLabel } from "../course/keys";
import { isJudge } from "../course/nodeTypes";
import { localize } from "../course/localize";
import { formatCost } from "../ai/client";
import { Tabs } from "../ui/controls";
import type { Course } from "../schema/types";
import { t } from "../i18n";

type Side = "calls" | "state" | "path" | "judges";

/** The first time the preview opens with no key, it asks for one (plan 5.5); once per session. */
let askedForKey = false;

export function PreviewTab() {
  const course = useEditor((s) => s.course)!;
  const hasKey = usePrefs((s) => s.hasKey);
  const reload = usePreview((s) => s.reload);
  const seed = usePreview((s) => s.seed);
  const lang = usePreview((s) => s.lang);
  const [side, setSide] = useState<Side>("calls");
  const sideOpen = useUi((s) => s.previewSide);
  const savedWidth = usePrefs((s) => s.sidebar.preview);
  const { width: sideWidth, handle: sideHandle } = useResizable(savedWidth, 300, 760, (w) =>
    usePrefs.getState().save({ sidebar: { ...usePrefs.getState().sidebar, preview: w } }),
  );
  const frame = useRef<HTMLIFrameElement>(null);
  const [frozen, setFrozen] = useState<Course>(course);
  const changed = frozen !== course;
  const courseRef = useRef(frozen);
  courseRef.current = frozen;

  // The page is rebuilt on restart, on "back to node", on a language change and
  // when the author asks for the edited course -- never behind their back.
  const html = useMemo(
    () => previewHtml(frozen, { seed, lang, manualJudges: !hasKey, theme: usePrefs.getState().theme }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reload, frozen, hasKey],
  );

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const m = event.data as { edukors?: string; id?: number; body?: string; state?: string; cover?: boolean; reviewing?: string | null };
      if (m?.edukors === "state" && typeof m.state === "string") {
        let state: PlayerState;
        try {
          state = JSON.parse(m.state);
        } catch {
          return;
        }
        const prev = currentState(usePreview.getState());
        const c = courseRef.current;
        let step = null;
        if (prev && prev.currentId && state.history.length === prev.history.length + 1) {
          const index = chooseEdge(c.edges, prev.currentId, state.vars);
          const edge = c.edges[index];
          step = { from: prev.currentId, to: state.currentId, edge: index, reason: edge ? (edge.when ? summarize(edge.when) : t("canvas.fallback")) : t("preview.end") };
        }
        usePreview.getState().record(state, step);
      }
      if (m?.edukors === "screen") usePreview.getState().setScreen({ cover: m.cover === true, reviewing: typeof m.reviewing === "string" ? m.reviewing : null });
      if (m?.edukors === "ai" && typeof m.id === "number") {
        const reply = await answer(courseRef.current, currentState(usePreview.getState()), m.body ?? "{}");
        frame.current?.contentWindow?.postMessage({ edukors: "ai-result", id: m.id, ...reply }, "*");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The theme reaches the running player as a message, so changing it keeps the student where they are.
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ edukors: "theme", theme }, "*");
  }, [theme]);

  useEffect(() => {
    if (hasKey || askedForKey || !usePrefs.getState().loaded) return;
    askedForKey = true;
    useUi.getState().open("prefs");
  }, [hasKey]);

  const langs = courseLangs(course);
  return (
    <div className="preview">
      <div className="preview-main">
        <div className="preview-bar">
          <button className="btn btn-small" onClick={() => usePreview.getState().restart()}>
            ↺ {t("preview.restart")}
          </button>
          <OnScreen />
          <label className="row small">
            {t("preview.lang")}
            <select className="input input-small" value={lang ?? ""} onChange={(e) => usePreview.getState().setLang(e.target.value || null)}>
              <option value="">{t("preview.langAuto")}</option>
              {langs.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          {changed && (
            <button
              className="btn btn-small btn-primary"
              onClick={() => {
                const state = currentState(usePreview.getState());
                usePreview.setState((s) => ({ seed: state, reload: s.reload + 1 }));
                setFrozen(course);
              }}
              title={t("preview.reloadHint")}
            >
              ⟳ {t("preview.reload")}
            </button>
          )}
          <span className="spacer" />
          {!hasKey && (
            <span className="notice notice-warning inline">
              {t("preview.noKey")}{" "}
              <button className="link" onClick={() => useUi.getState().open("prefs")}>
                {t("preview.configure")}
              </button>
            </span>
          )}
          {Object.keys(usePreview.getState().forced).length > 0 && <span className="pill pill-warning">{t("preview.forcedMode")}</span>}
        </div>
        <iframe
          key={reload + (frozen === course ? 0 : 0)}
          ref={frame}
          className="preview-frame"
          title={t("preview.title")}
          sandbox="allow-scripts allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox"
          srcDoc={html}
        />
      </div>
      {sideOpen && (
        <aside className="preview-side" style={{ width: sideWidth }}>
          {sideHandle}
          <Tabs<Side>
            value={side}
            onChange={setSide}
            tabs={[
              { id: "calls", label: t("preview.calls") },
              { id: "state", label: t("preview.state") },
              { id: "path", label: t("preview.path") },
              { id: "judges", label: t("preview.judges") },
            ]}
          />
          <div className="preview-side-body">
            {side === "calls" && <Calls />}
            {side === "state" && <StudentState course={frozen} />}
            {side === "path" && <PathView course={frozen} />}
            {side === "judges" && <ForcedJudges course={frozen} />}
          </div>
        </aside>
      )}
    </div>
  );
}

/** The node the player is showing; a click shows it on the graph. */
function OnScreen() {
  const course = useEditor((s) => s.course)!;
  const lang = useEditor((s) => s.canvasLang);
  const states = usePreview((s) => s.states);
  const screen = usePreview((s) => s.screen);
  const state = currentState({ states });
  if (!state || screen.cover) return null;
  const id = screen.reviewing ?? state.currentId;
  if (!id) return <span className="small muted">{t("preview.finished")}</span>;
  const node = course.nodes.find((n) => n.id === id);
  return (
    <span className="row small">
      <span className="muted">{t("preview.showing")}</span>
      <button className="chip" disabled={!node} onClick={() => useEditor.getState().reveal({ node: id })} title={node ? `${localize(node.title, lang)} — ${t("preview.showInGraph")}` : undefined}>
        {id}
      </button>
    </span>
  );
}

function Calls() {
  const calls = usePreview((s) => s.calls);
  const notJudged = usePreview((s) => s.notJudged);
  const [open, setOpen] = useState<CallLog | null>(null);
  const total = calls.reduce((sum, c) => sum + (c.cost ?? 0), 0);
  return (
    <div>
      <div className="row small muted">
        {t("preview.callCount", { n: calls.length })} · {formatCost(total)}
        <span className="spacer" />
        <button className="link" onClick={() => usePreview.getState().clearLog()}>
          {t("preview.clear")}
        </button>
      </div>
      {notJudged.map((n, i) => (
        <div key={i} className="notice notice-warning">
          <strong>{n.node}</strong> {t("preview.notJudged")}: {n.reason}
        </div>
      ))}
      <table className="table small">
        <thead>
          <tr>
            <th>{t("preview.node")}</th>
            <th>{t("preview.endpoint")}</th>
            <th>{t("preview.model")}</th>
            <th>tokens</th>
            <th>$</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id} className={`clickable ${c.ok ? "" : "is-error"}`} onClick={() => setOpen(c)} title={c.note}>
              <td>
                {c.node} <span className="muted">{c.kind}</span>
              </td>
              <td>{c.endpoint}</td>
              <td className="ellipsis">{c.answered || c.model}</td>
              <td>{c.tokensIn ?? "—"}/{c.tokensOut ?? "—"}</td>
              <td>{formatCost(c.cost)}</td>
              <td>{c.ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && (
        <div className="call-detail">
          <div className="row">
            <strong>
              {open.node} · {open.endpoint} · {open.at}
            </strong>
            <span className="spacer" />
            <button className="link" onClick={() => setOpen(null)}>
              ×
            </button>
          </div>
          {open.note && <div className={`notice ${open.ok ? "" : "notice-error"}`}>{open.note}</div>}
          <div className="field-label">{t("preview.sent")}</div>
          <pre className="code-block">{JSON.stringify(open.request, null, 2)}</pre>
          <div className="field-label">{t("preview.raw")}</div>
          <pre className="code-block">{prettyJson(open.response)}</pre>
        </div>
      )}
    </div>
  );
}

const prettyJson = (raw: string) => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

function StudentState({ course }: { course: Course }) {
  const states = usePreview((s) => s.states);
  const state = currentState({ states });
  const keys = useMemo(() => new Map(keysOfCourse(course, course.info["source-language"]).map((k) => [k.key, k])), [course]);
  if (!state) return <p className="muted">{t("preview.notStarted")}</p>;
  const entries = Object.entries(state.vars ?? {});
  return (
    <div>
      <p className="small">
        {t("preview.current")}: <strong>{state.currentId ?? t("preview.finished")}</strong> · {t("preview.lang")}: {state.lang}
      </p>
      <table className="table small">
        <thead>
          <tr>
            <th>{t("preview.key")}</th>
            <th>{t("preview.value")}</th>
            <th>{t("preview.scale")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, v]) => {
            const info = keys.get(k);
            return (
              <tr key={k}>
                <td>
                  <code>{k}</code>
                </td>
                <td className="value-cell">{typeof v === "string" ? (v.length > 160 ? `${v.slice(0, 160)}…` : v) : JSON.stringify(v)}</td>
                <td className="muted">{info ? scaleLabel(info) : k.includes("~spread") ? t("preview.spread") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PathView({ course }: { course: Course }) {
  const steps = usePreview((s) => s.steps);
  const states = usePreview((s) => s.states);
  const lang = useEditor((s) => s.canvasLang);
  const state = currentState({ states });
  const reveal = useEditor((s) => s.reveal);
  if (!state) return <p className="muted">{t("preview.notStarted")}</p>;
  const title = (id: string | null) => (id ? localize(course.nodes.find((n) => n.id === id)?.title, lang) : t("preview.finished"));
  const visited = [...new Set(state.history)];
  return (
    <div>
      <p className="small muted">{t("preview.pathHint")}</p>
      <ol className="path-list">
        {steps.map((s, i) => (
          <li key={i}>
            <button className="link" onClick={() => reveal({ node: s.from })}>
              {s.from}
            </button>{" "}
            → <strong>{s.to ?? "■"}</strong> <span className="muted">{title(s.to)}</span>
            <div className="small">
              <span className="edge-order">{s.edge === -1 ? "—" : `#${s.edge}`}</span> <code>{s.reason}</code>
            </div>
          </li>
        ))}
      </ol>
      <div className="field-label">{t("preview.backTo")}</div>
      <div className="chips">
        {[...visited, ...(state.currentId ? [state.currentId] : [])].map((id) => (
          <button key={id} className="chip" onClick={() => usePreview.getState().goBack(id)} title={title(id)}>
            ↩ {id}
          </button>
        ))}
      </div>
    </div>
  );
}

function ForcedJudges({ course }: { course: Course }) {
  const forced = usePreview((s) => s.forced);
  const lang = useEditor((s) => s.canvasLang);
  const judges = course.nodes.filter((n) => isJudge(n.type));
  if (!judges.length) return <p className="muted">{t("preview.noJudges")}</p>;
  return (
    <div>
      <p className="small muted">{t("preview.forceHint")}</p>
      {judges.map((node) => {
        const pick = forced[node.id];
        const items: { key: string; criteria?: unknown }[] = Array.isArray(node.content?.items) ? node.content.items : [];
        return (
          <div key={node.id} className={`force-box ${pick ? "is-on" : ""}`}>
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(pick)}
                onChange={(e) =>
                  usePreview.getState().setForced(
                    node.id,
                    e.target.checked
                      ? Object.fromEntries(
                          items.map((it) => [
                            it.key,
                            node.type === "choice"
                              ? { value: Object.keys((it.criteria as object) ?? {})[0] ?? "", confidence: 1 }
                              : node.type === "score"
                                ? { value: Math.max(0, (Array.isArray(it.criteria) ? it.criteria.length : 1) - 1), confidence: 1 }
                                : { value: 0.9 },
                          ]),
                        )
                      : null,
                  )
                }
              />
              <strong>{node.id}</strong> {localize(node.title, lang)} <span className="muted">({node.type})</span>
            </label>
            {pick &&
              items.map((it) => (
                <div key={it.key} className="row small">
                  <code>{it.key}</code>
                  {node.type === "choice" ? (
                    <select
                      className="input input-small"
                      value={String(pick[it.key]?.value ?? "")}
                      onChange={(e) => usePreview.getState().setForced(node.id, { ...pick, [it.key]: { ...pick[it.key], value: e.target.value } })}
                    >
                      {Object.keys((it.criteria as object) ?? {}).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input input-small input-number"
                      type="number"
                      step="0.01"
                      min={0}
                      max={node.type === "score" ? Math.max(1, (Array.isArray(it.criteria) ? it.criteria.length : 2) - 1) : 1}
                      value={Number(pick[it.key]?.value ?? 0)}
                      onChange={(e) => usePreview.getState().setForced(node.id, { ...pick, [it.key]: { ...pick[it.key], value: Number(e.target.value) } })}
                    />
                  )}
                  {node.type !== "noul" && (
                    <>
                      <span className="muted">{t("preview.confidence")}</span>
                      <input
                        className="input input-small input-number"
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        value={Number(pick[it.key]?.confidence ?? 1)}
                        onChange={(e) => usePreview.getState().setForced(node.id, { ...pick, [it.key]: { ...pick[it.key], confidence: Number(e.target.value) } })}
                      />
                    </>
                  )}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
