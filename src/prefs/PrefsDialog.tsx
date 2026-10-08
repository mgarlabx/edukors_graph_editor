/**
 * Preferences (plan 5.7): the interface's language and theme; the key, in the
 * Keychain; the models and their settings, mirroring the player's config.php
 * (the judge always holds to the exact slug, at the decisions endpoint: see
 * judgeSettings); the agent's instructions, MCP servers and skills.
 */
import { useEffect, useState } from "react";
import { native } from "../app/platform";
import { usePrefs, DEFAULT_PREFS, type Prefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { modelIds } from "../ai/client";
import { judgeModel } from "../judge/pipeline";
import { AutoTextarea, Field, Modal, NumberInput } from "../ui/controls";
import { UI_LANGS, t, type UiLang } from "../i18n";
import { errorText } from "../i18n/errors";
import { parseMcpConfig } from "../agent/mcpConfig";
import { useAgent } from "../agent/store";
import { PROVIDER_IDS, type ProviderId } from "../agent/events";
import { AgentSkills } from "./AgentSkills";

const MCP_EXAMPLE = `{
  "mcpServers": {
    "files": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Courses"] },
    "docs": { "type": "http", "url": "https://example.org/mcp" }
  }
}`;

export function PrefsDialog() {
  const close = useUi((s) => s.close);
  const prefs = usePrefs();
  const [key, setKey] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [draft, setDraft] = useState<Prefs>({
    uiLang: prefs.uiLang,
    theme: prefs.theme,
    ai: prefs.ai,
    judge: prefs.judge,
    agent: prefs.agent,
    sidebar: prefs.sidebar,
    editorWrap: prefs.editorWrap,
    recent: prefs.recent,
    terms: prefs.terms,
  });

  useEffect(() => {
    modelIds().then(setModels).catch(() => undefined);
  }, []);

  let judgeProblem = "";
  try {
    judgeModel(draft.judge.model);
  } catch (e) {
    judgeProblem = errorText(e);
  }
  const mcpProblem = parseMcpConfig(draft.agent.mcp).problem;


  const save = async () => {
    // The agent panel keeps its own settings, and the content editor its line wrapping; they may have changed while this was open. The instructions, the MCP servers and the provider are this dialog's.
    const live = usePrefs.getState().agent;
    await prefs.save({ ...draft, sidebar: usePrefs.getState().sidebar, editorWrap: usePrefs.getState().editorWrap, agent: { ...live, instructions: draft.agent.instructions, mcp: draft.agent.mcp } });
    // Changing the provider closes the conversation and opens one on the other side.
    if (draft.agent.provider !== live.provider) void useAgent.getState().setProvider(draft.agent.provider);
    close();
  };

  return (
    <Modal
      title={t("prefs.title")}
      onClose={close}
      wide
      actions={
        <>
          <button className="btn" onClick={() => setDraft({ ...DEFAULT_PREFS, uiLang: draft.uiLang, theme: draft.theme, recent: draft.recent, agent: draft.agent, terms: draft.terms })}>
            {t("prefs.defaults")}
          </button>
          <span className="spacer" />
          <button className="btn" onClick={close}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!!mcpProblem}>
            {t("common.save")}
          </button>
        </>
      }
    >
      <datalist id="models">
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <h3>{t("prefs.app")}</h3>
      <div className="grid-3">
        <Field label={t("prefs.uiLang")}>
          <select className="input" value={draft.uiLang} onChange={(e) => setDraft({ ...draft, uiLang: e.target.value as UiLang })}>
            {UI_LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`ui.${l}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("prefs.theme")}>
          <select className="input" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as Prefs["theme"] })}>
            <option value="system">{t("prefs.themeSystem")}</option>
            <option value="light">{t("prefs.themeLight")}</option>
            <option value="dark">{t("prefs.themeDark")}</option>
          </select>
        </Field>
      </div>

      <h3>{t("prefs.key")}</h3>
      <p className="small muted">{t("prefs.keyHint")}</p>
      <div className="row">
        <span className={`pill ${prefs.hasKey ? "pill-ok" : "pill-warning"}`}>{prefs.hasKey ? t("prefs.keySet") : t("prefs.keyMissing")}</span>
        <input className="input grow" type="password" autoComplete="off" placeholder="sk-or-v1-…" value={key} onChange={(e) => setKey(e.target.value)} />
        <button
          className="btn"
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
      {keyMessage && <p className="small">{keyMessage}</p>}

      <h3>{t("prefs.generation")}</h3>
      <div className="grid-3">
        <Field label={t("prefs.model")} hint="ai.model">
          <input className="input" list="models" value={draft.ai.model} onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, model: e.target.value } })} />
        </Field>
        <Field label={t("prefs.temperature")} hint="ai.temperature">
          <NumberInput value={draft.ai.temperature} min={0} max={2} step={0.1} onChange={(v) => setDraft({ ...draft, ai: { ...draft.ai, temperature: v ?? 0.7 } })} />
        </Field>
        <Field label={t("prefs.maxTokens")} hint="ai.max_tokens">
          <NumberInput value={draft.ai.maxTokens} min={64} step={1} onChange={(v) => setDraft({ ...draft, ai: { ...draft.ai, maxTokens: Math.round(v ?? 1200) } })} />
        </Field>
      </div>

      <h3>{t("prefs.judge")}</h3>
      <p className="small muted">{t("prefs.judgeHint")}</p>
      <div className="grid-3">
        <Field label={t("prefs.judgeModel")} hint="judge.model" error={judgeProblem}>
          <input className="input" list="models" value={draft.judge.model} onChange={(e) => setDraft({ ...draft, judge: { ...draft.judge, model: e.target.value } })} />
        </Field>
        <Field label={t("prefs.minConfidence")} hint="judge.min_confidence">
          <NumberInput value={draft.judge.minConfidence} min={0} max={1} step={0.05} onChange={(v) => setDraft({ ...draft, judge: { ...draft.judge, minConfidence: v ?? 0 } })} />
        </Field>
      </div>

      <h3>{t("prefs.agent")}</h3>
      <Field label={t("prefs.agentProvider")} hint={t("prefs.agentProviderHint")}>
        <select className="input" value={draft.agent.provider} onChange={(e) => setDraft({ ...draft, agent: { ...draft.agent, provider: e.target.value as ProviderId } })}>
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`agent.provider.${id}`)}
            </option>
          ))}
        </select>
      </Field>
      <p className="small muted">{t("prefs.agentHint")}</p>
      <Field label={t("prefs.agentInstructions")}>
        <AutoTextarea
          minRows={6}
          value={draft.agent.instructions}
          placeholder={t("prefs.agentPlaceholder")}
          onChange={(e) => setDraft({ ...draft, agent: { ...draft.agent, instructions: e.target.value } })}
        />
      </Field>
      <Field label={t("prefs.agentMcp")} hint={t("prefs.agentMcpHint")} error={mcpProblem && t(mcpProblem.key, mcpProblem.params)}>
        <AutoTextarea
          className="mono"
          minRows={4}
          spellCheck={false}
          value={draft.agent.mcp}
          placeholder={MCP_EXAMPLE}
          onChange={(e) => setDraft({ ...draft, agent: { ...draft.agent, mcp: e.target.value } })}
        />
      </Field>
      <Field label={t("prefs.agentSkills")} hint={t("prefs.agentSkillsHint")}>
        <AgentSkills />
      </Field>
    </Modal>
  );
}
