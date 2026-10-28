/**
 * The agent's skills, in the preferences: what is in the editor's skills
 * folder (listed by the agent's process, which reads the SKILL.md files), and
 * a way to that folder in the Finder. Adding a skill is putting its folder
 * (with a SKILL.md) there. Only these skills are offered to the agent.
 */
import { useCallback, useEffect, useState } from "react";
import { connect, request } from "../agent/client";
import type { SkillInfo } from "../agent/store";
import { call, isTauri } from "../app/platform";
import { t } from "../i18n";

export function AgentSkills() {
  const [list, setList] = useState<{ dir: string; skills: SkillInfo[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      await connect();
      const { skills: dir } = await call<{ skills: string }>("agent_paths");
      setList({ dir, skills: await request<SkillInfo[]>("skills.list", { dir }) });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reveal = async () => {
    if (!list) return;
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(list.dir).catch(() => undefined);
  };

  return (
    <div className="agent-skills">
      {failed ? (
        <p className="small muted">{t("prefs.skillsUnavailable")}</p>
      ) : !list ? (
        <p className="small muted">{t("prefs.skillsLoading")}</p>
      ) : list.skills.length ? (
        <ul className="agent-skills-list">
          {list.skills.map((s) => (
            <li key={s.folder}>
              <code>{s.name}</code>
              {s.description && <span className="small muted"> — {s.description}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">{t("prefs.skillsNone")}</p>
      )}
      <div className="row">
        {isTauri() && (
          <button className="btn" disabled={!list} onClick={reveal}>
            {t("prefs.skillsReveal")}
          </button>
        )}
        <button className="btn" onClick={load}>
          {t("prefs.skillsReload")}
        </button>
      </div>
    </div>
  );
}
