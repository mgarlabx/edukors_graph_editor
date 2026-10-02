/**
 * The judge probe, made visual (plan 5.6): sample values for the keys the
 * judgement reads, the exact body the server would send, the raw answer, the
 * keys it would store, the edge the student would take -- and, when the
 * answer does not count, why. A pasted answer can be tried without a call.
 */
import { useMemo, useState } from "react";
import { useEditor } from "../store/editor";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { currentState, usePreview } from "../preview/session";
import { judgeAndLog, judgeSettings } from "../preview/host";
import { judgeBody, judgeModel, judgeState, judgeVars, NotJudged, readAnswers, sameModel, type Vars, type Verdict } from "./pipeline";
import { chooseEdge, summarize } from "../course/condition";
import { storageKeys } from "../course/localize";
import { keysOfCourse, scaleLabel } from "../course/keys";
import { AutoTextarea, Modal } from "../ui/controls";
import { t } from "../i18n";
import { errorText } from "../i18n/errors";

export function ProbeDialog() {
  const nodeId = useUi((s) => s.probeNode);
  const close = useUi((s) => s.close);
  const course = useEditor((s) => s.course)!;
  const hasKey = usePrefs((s) => s.hasKey);
  const node = course.nodes.find((n) => n.id === nodeId);
  const latest = currentState(usePreview.getState())?.vars ?? {};
  const reads = useMemo(() => {
    if (!node) return [];
    const texts = [
      ...Object.values(node.content?.state ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v])),
      ...(node.content?.items ?? []).map((i: { instructions?: string }) => i?.instructions ?? ""),
    ];
    return [...new Set(texts.flatMap((x) => storageKeys(String(x))))];
  }, [node]);
  const keyInfo = useMemo(() => new Map(keysOfCourse(course, course.info["source-language"]).map((k) => [k.key, k])), [course]);
  const [sample, setSample] = useState<Record<string, string>>(() =>
    Object.fromEntries(reads.map((k) => [k, latest[k] === undefined ? "" : typeof latest[k] === "string" ? (latest[k] as string) : JSON.stringify(latest[k])])),
  );
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [pasted, setPasted] = useState("");
  const [pastedResult, setPastedResult] = useState<{ judged: boolean; vars: Vars; reason: string | null } | null>(null);

  if (!node) return null;

  const vars: Vars = Object.fromEntries(
    Object.entries(sample).map(([k, v]) => {
      const info = keyInfo.get(k);
      if (info?.scale === "list") return [k, v.split(",").map((s) => s.trim()).filter(Boolean)];
      if (info?.scale === "bool") return [k, v === "true"];
      if (info && ["percent", "unit", "level", "count", "points"].includes(info.scale) && v.trim() !== "" && !Number.isNaN(Number(v))) return [k, Number(v)];
      return [k, v];
    }),
  );
  let model = "";
  let modelError = "";
  try {
    model = judgeModel(judgeSettings().model);
  } catch (e) {
    modelError = errorText(e);
  }
  const body = judgeBody(node.type, node.content?.items ?? [], judgeState(node.content, vars), model || judgeSettings().model);

  const route = (produced: Vars | null) => {
    const all = { ...vars, ...(produced ?? {}) };
    const index = chooseEdge(course.edges, node.id, all);
    const edge = course.edges[index];
    return edge ? `→ ${edge.to}  (${edge.when ? summarize(edge.when) : t("canvas.fallback")})` : t("probe.noEdge");
  };

  const tryPasted = () => {
    try {
      const json = JSON.parse(pasted) as { answers?: unknown; model?: string };
      const answered = String(json.model ?? "");
      const s = judgeSettings();
      if (s.strictModel && answered && !sameModel(answered, model))
        throw new NotJudged("other-model", { answered, model });
      const answers = json.answers ?? json;
      if (!answers || typeof answers !== "object" || !Object.keys(answers).length) throw new NotJudged("no-answers");
      const produced = judgeVars(node.id, node.type, node.content, readAnswers(answers, node.type, node.content?.items ?? []), s.minConfidence);
      setPastedResult({ judged: true, vars: produced, reason: null });
    } catch (e) {
      setPastedResult({ judged: false, vars: {}, reason: errorText(e) });
    }
  };

  const result = verdict ? { judged: verdict.judged, vars: verdict.vars, reason: verdict.reason } : pastedResult;

  return (
    <Modal title={`${t("probe.title")} — ${node.id}`} onClose={close} wide="full">
      <div className="probe">
        <div className="probe-col">
          <h3>{t("probe.sample")}</h3>
          {!reads.length && <p className="muted">{t("probe.noKeys")}</p>}
          {reads.map((k) => (
            <div key={k} className="field">
              <div className="field-label">
                <code>{`{{STORAGE: ${k}}}`}</code> <span className="muted">{keyInfo.get(k) ? scaleLabel(keyInfo.get(k)!) : t("probe.unknownKey")}</span>
              </div>
              <AutoTextarea minRows={keyInfo.get(k)?.scale === "text" ? 4 : 1} value={sample[k] ?? ""} onChange={(e) => setSample({ ...sample, [k]: e.target.value })} />
            </div>
          ))}
          <h3>{t("probe.body")}</h3>
          {modelError && <div className="notice notice-error">{modelError}</div>}
          <pre className="code-block">{JSON.stringify(body, null, 2)}</pre>
        </div>
        <div className="probe-col">
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={busy || !hasKey}
              onClick={async () => {
                setBusy(true);
                setPastedResult(null);
                setVerdict(await judgeAndLog(course, node.id, vars));
                setBusy(false);
              }}
            >
              {busy ? t("common.working") : t("probe.send")}
            </button>
            {!hasKey && <span className="muted small">{t("probe.needKey")}</span>}
            <span className="muted small">
              {t("probe.settings", { model: judgeSettings().model, floor: judgeSettings().minConfidence, strict: String(judgeSettings().strictModel) })}
            </span>
          </div>
          {verdict?.http && (
            <>
              <h3>{t("probe.raw")}</h3>
              <pre className="code-block">{verdict.http.raw || verdict.http.error}</pre>
            </>
          )}
          <details>
            <summary>{t("probe.paste")}</summary>
            <AutoTextarea className="mono" minRows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"model":"typesafe/jev-1.13-20260917","answers":{…}}' />
            <button
              className="btn btn-small"
              onClick={() => {
                setVerdict(null);
                tryPasted();
              }}
            >
              {t("probe.tryPasted")}
            </button>
          </details>
          {result && (
            <>
              <h3>{t("probe.result")}</h3>
              {result.judged ? (
                <div className="notice notice-ok">{t("probe.judged")}</div>
              ) : (
                <div className="notice notice-error">
                  {t("probe.notJudged")}: {result.reason}
                </div>
              )}
              <table className="table small">
                <tbody>
                  {Object.entries(result.vars).map(([k, v]) => (
                    <tr key={k}>
                      <td>
                        <code>{k}</code>
                      </td>
                      <td>{JSON.stringify(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>{t("probe.edge")}</h3>
              <p>
                <code>{route(result.judged ? result.vars : null)}</code>
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
