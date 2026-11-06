/**
 * Settings → Preview with AI: the OpenRouter key (kept by the main process, encrypted by the system) and the models
 * the preview uses to write dynamic steps and to judge, mirroring the player's config.php (the judge always holds to
 * the exact slug, at the decisions endpoint: see judgeSettings). Saved as each value changes, like Common's Settings.
 * The interface language, the theme and the AI assistant are Common's sections.
 */
import { useEffect, useState } from "react";
import { native } from "../app/platform";
import { usePrefs } from "../store/prefs";
import { modelIds } from "../ai/client";
import { judgeModel } from "../judge/pipeline";
import { Field, NumberInput } from "../ui/controls";
import { t } from "../i18n";
import { errorText } from "../i18n/errors";
import { CheckCircleIcon, WarningIcon } from "../ui/icons";

export function GraphSettings() {
  const prefs = usePrefs();
  const [key, setKey] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    modelIds().then(setModels).catch(() => undefined);
  }, []);

  let judgeProblem = "";
  try {
    judgeModel(prefs.judge.model);
  } catch (e) {
    judgeProblem = errorText(e);
  }

  return (
    <div className="graph-settings">
      <h3>{t("prefs.key")}</h3>
      <div className="prefs-card">
        <div className={`prefs-status ${prefs.hasKey ? "is-ok" : "is-warning"}`}>
          {prefs.hasKey ? <CheckCircleIcon /> : <WarningIcon />}
          {prefs.hasKey ? t("prefs.keySet") : t("prefs.keyMissing")}
        </div>
        <div className="row">
          <input className="input grow" type="password" autoComplete="off" placeholder="sk-or-v1-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!key.trim()}
            onClick={async () => {
              try {
                await native.keySet(key.trim());
                setKey("");
                setKeyMessage(t("prefs.keySaved"));
                await prefs.refreshKey();
              } catch (e) {
                setKeyMessage(errorText(e));
              }
            }}
          >
            {t("prefs.keySave")}
          </button>
          {prefs.hasKey && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                await native.keyDelete();
                await prefs.refreshKey();
                setKeyMessage(t("prefs.keyDeleted"));
              }}
            >
              {t("prefs.keyDelete")}
            </button>
          )}
        </div>
        {keyMessage && <p className="small muted">{keyMessage}</p>}
      </div>

      <h3>{t("prefs.generation")}</h3>
      <div className="prefs-card">
        <Field label={t("prefs.model")} hint={<code>ai.model</code>}>
          <input className="input" list="graph-models" value={prefs.ai.model} onChange={(e) => void prefs.save({ ai: { ...prefs.ai, model: e.target.value } })} />
        </Field>
        <Field label={t("prefs.maxTokens")} hint={<code>ai.max_tokens</code>}>
          <NumberInput value={prefs.ai.maxTokens} min={64} step={1} onChange={(v) => void prefs.save({ ai: { ...prefs.ai, maxTokens: Math.round(v ?? 1200) } })} />
        </Field>
      </div>

      <h3>{t("prefs.judge")}</h3>
      <div className="prefs-card">
        <Field label={t("prefs.judgeModel")} hint={<code>judge.model</code>} error={judgeProblem}>
          <input className="input" list="graph-models" value={prefs.judge.model} onChange={(e) => void prefs.save({ judge: { ...prefs.judge, model: e.target.value } })} />
        </Field>
        <Field label={t("prefs.minConfidence")} hint={<code>judge.min_confidence</code>}>
          <NumberInput value={prefs.judge.minConfidence} min={0} max={1} step={0.05} onChange={(v) => void prefs.save({ judge: { ...prefs.judge, minConfidence: v ?? 0 } })} />
        </Field>
      </div>
      <datalist id="graph-models">
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}
