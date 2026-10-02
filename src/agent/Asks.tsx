/**
 * What the agent asks the person, above the composer: to approve an action,
 * to answer its questions, to approve its plan. The agent waits meanwhile.
 */
import { useState } from "react";
import { useAgent, type Ask } from "./store";
import { OpsList, shortTool, toolLabel } from "./Messages";
import { Markdown } from "./Markdown";
import { t } from "../i18n";
import { BoltIcon, HandIcon } from "../ui/icons";

function Feedback({ placeholder, action, onSend, onCancel }: { placeholder: string; action: string; onSend: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="agent-feedback">
      <textarea
        className="input textarea"
        rows={2}
        autoFocus
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend(text);
          } else if (e.key === "Escape") onCancel();
        }}
      />
      <div className="agent-ask-actions">
        <button type="button" className="btn btn-small" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn-small btn-primary" onClick={() => onSend(text)}>
          {action}
        </button>
      </div>
    </div>
  );
}

const QUESTION: Record<string, string> = {
  edit_course: "agent.ask.edit",
  replace_course: "agent.ask.replace",
  new_course: "agent.ask.new",
  Read: "agent.ask.read",
  Glob: "agent.ask.find",
  Grep: "agent.ask.find",
  WebFetch: "agent.ask.fetch",
  WebSearch: "agent.ask.websearch",
  Bash: "agent.ask.bash",
};

function PermissionCard({ ask }: { ask: Ask }) {
  const answer = useAgent((s) => s.answer);
  const [feedback, setFeedback] = useState(false);
  const tool = shortTool(ask.tool);
  const { label, detail } = toolLabel(ask.tool, ask.input);
  const target =
    typeof ask.input.command === "string" && tool === "Bash"
      ? ask.input.command
      : typeof ask.input.file_path === "string"
        ? ask.input.file_path
        : typeof ask.input.path === "string"
          ? ask.input.path
          : typeof ask.input.url === "string"
            ? ask.input.url
            : null;
  return (
    <div className="agent-ask" role="dialog" aria-label={label}>
      <div className="agent-ask-title">{QUESTION[tool] ? t(QUESTION[tool]) : t("agent.ask.other", { tool: label })}</div>
      {detail && <div className="agent-ask-summary">{detail}</div>}
      {(tool === "edit_course" || tool === "replace_course") && <OpsList tool={ask.tool} input={ask.input} />}
      {target && <code className="agent-ask-target">{target}</code>}
      {tool === "new_course" && typeof ask.input.language === "string" && <code className="agent-ask-target">{ask.input.language}</code>}
      {feedback ? (
        <Feedback
          placeholder={t("agent.feedbackPlaceholder")}
          action={t("agent.deny")}
          onCancel={() => setFeedback(false)}
          onSend={(text) => answer(ask.id, { behavior: "deny", message: text.trim() ? `The person declined, and said: ${text.trim()}` : undefined })}
        />
      ) : (
        <div className="agent-ask-actions">
          <button type="button" className="btn btn-small btn-primary" onClick={() => answer(ask.id, { behavior: "allow" })} autoFocus>
            {t("agent.allow")}
          </button>
          {!ask.once && (
            <button type="button" className="btn btn-small" onClick={() => answer(ask.id, { behavior: "allow", always: true })}>
              {t("agent.allowAlways")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-small" onClick={() => answer(ask.id, { behavior: "deny" })}>
            {t("agent.deny")}
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFeedback(true)} title={t("agent.denyWith")}>
            …
          </button>
        </div>
      )}
    </div>
  );
}

interface Question {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
}

function QuestionCard({ ask }: { ask: Ask }) {
  const answerAsk = useAgent((s) => s.answer);
  const questions = (Array.isArray(ask.input.questions) ? ask.input.questions : []) as Question[];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const value = (q: Question) => (other[q.question]?.trim() ? [other[q.question].trim()] : picked[q.question] ?? []);
  const complete = questions.every((q) => value(q).length > 0);
  const toggle = (q: Question, label: string) =>
    setPicked((p) => {
      const now = p[q.question] ?? [];
      const next = q.multiSelect ? (now.includes(label) ? now.filter((l) => l !== label) : [...now, label]) : [label];
      return { ...p, [q.question]: next };
    });
  const submit = () => {
    const answers = Object.fromEntries(questions.map((q) => [q.question, value(q).join(", ")]));
    answerAsk(ask.id, { behavior: "allow", updatedInput: { ...ask.input, questions: ask.input.questions, answers } });
  };
  return (
    <div className="agent-ask" role="dialog">
      {questions.map((q) => (
        <fieldset key={q.question} className="agent-question">
          <legend>
            {q.header && <span className="pill">{q.header}</span>} {q.question}
          </legend>
          <div className="agent-options">
            {q.options.map((o) => {
              const on = (picked[q.question] ?? []).includes(o.label) && !other[q.question]?.trim();
              return (
                <button key={o.label} type="button" className={`agent-option ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => toggle(q, o.label)}>
                  <span className="agent-option-label">{o.label}</span>
                  {o.description && <span className="agent-option-desc">{o.description}</span>}
                </button>
              );
            })}
            <input
              className="input"
              placeholder={t("agent.q.other")}
              value={other[q.question] ?? ""}
              onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && complete) submit();
              }}
            />
          </div>
        </fieldset>
      ))}
      <div className="agent-ask-actions">
        <button type="button" className="btn btn-small btn-primary" disabled={!complete} onClick={submit}>
          {t("agent.q.submit")}
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-small" onClick={() => answerAsk(ask.id, { behavior: "deny", message: "The person chose not to answer; go on with your best judgement or ask in your reply." })}>
          {t("agent.q.skip")}
        </button>
      </div>
    </div>
  );
}

function PlanCard({ ask }: { ask: Ask }) {
  const answer = useAgent((s) => s.answer);
  const [feedback, setFeedback] = useState(false);
  const plan = typeof ask.input.plan === "string" && ask.input.plan.trim() ? ask.input.plan : null;
  return (
    <div className="agent-ask agent-plan" role="dialog" aria-label={t("agent.plan.title")}>
      <div className="agent-ask-title">{t("agent.plan.title")}</div>
      {plan ? <Markdown text={plan} className="agent-plan-text" /> : <div className="agent-ask-summary">{t("agent.plan.seeAbove")}</div>}
      {feedback ? (
        <Feedback
          placeholder={t("agent.plan.keepPlaceholder")}
          action={t("agent.plan.keep")}
          onCancel={() => setFeedback(false)}
          onSend={(text) => answer(ask.id, { behavior: "deny", message: text.trim() ? `Keep planning. The person said: ${text.trim()}` : "Keep planning: the person wants changes to the plan." })}
        />
      ) : (
        <div className="agent-ask-actions agent-ask-column">
          <button type="button" className="btn btn-small btn-primary" onClick={() => answer(ask.id, { behavior: "allow", mode: "auto" })}>
            <BoltIcon size={14} /> {t("agent.plan.approveAuto")}
          </button>
          <button type="button" className="btn btn-small" onClick={() => answer(ask.id, { behavior: "allow", mode: "ask" })}>
            <HandIcon size={14} /> {t("agent.plan.approveAsk")}
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFeedback(true)}>
            {t("agent.plan.keep")}…
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * In plan mode, a turn that ended with the agent's words is taken for a plan:
 * whether or not the agent asked for approval (ExitPlanMode), the person can
 * approve it from here, which changes the mode and tells the agent to go on.
 */
function PlanBar() {
  const show = useAgent((s) => {
    if (s.mode !== "plan" || !s.planTurn || s.busy || s.asks.length) return false;
    const last = s.items[s.items.length - 1];
    return last?.kind === "text";
  });
  const go = (mode: "auto" | "ask") => {
    const agent = useAgent.getState();
    agent.setMode(mode);
    void agent.send(t("agent.plan.go"));
  };
  if (!show) return null;
  return (
    <div className="agent-ask agent-plan-bar">
      <div className="agent-ask-title">{t("agent.plan.ready")}</div>
      <div className="agent-ask-actions">
        <button type="button" className="btn btn-small btn-primary" onClick={() => go("auto")}>
          <BoltIcon size={14} /> {t("agent.plan.approveAuto")}
        </button>
        <button type="button" className="btn btn-small" onClick={() => go("ask")}>
          <HandIcon size={14} /> {t("agent.plan.approveAsk")}
        </button>
      </div>
    </div>
  );
}

export function Asks() {
  const asks = useAgent((s) => s.asks);
  return (
    <div className="agent-asks">
      {asks.map((ask) =>
        ask.kind === "question" ? <QuestionCard key={ask.id} ask={ask} /> : ask.kind === "plan" ? <PlanCard key={ask.id} ask={ask} /> : <PermissionCard key={ask.id} ask={ask} />,
      )}
      <PlanBar />
    </div>
  );
}
