/**
 * What answers the player's model calls in the preview: a port of the two
 * things api/ai.php does with them. A step is written with the server's own
 * prompt (buildGeneration) and settings; a node is judged with the server's
 * body, its acceptance rules and its confidence floor (judgeNode). A judgement
 * the author forced replaces the call, and says so in the log.
 */
import { chatBody } from "../ai/client";
import { native } from "../app/platform";
import { buildGeneration, forcedVars, judgeNode, type Verdict } from "../judge/pipeline";
import { usePrefs } from "../store/prefs";
import { usePreview, type PlayerState } from "./session";
import type { Course } from "../schema/types";
import { isDynamic, isJudge } from "../course/nodeTypes";
import { t } from "../i18n";
import { errorText } from "../i18n/errors";

type Reply = { status: number; json: unknown };

const text = (t: string): Reply => ({ status: 200, json: { content: [{ type: "text", text: t }] } });
const failure = (message: string, status = 502): Reply => ({ status, json: { error: { message } } });

export const judgeSettings = () => {
  const j = usePrefs.getState().judge;
  return { model: j.model, minConfidence: j.minConfidence, strictModel: j.strictModel, url: j.url, timeout: j.timeout };
};

/**
 * Judges as the server would, logging the call. Shared with the judge probe.
 * `doc` is the tab asking, taken before the call: the answer may come back after it was left.
 */
export async function judgeAndLog(course: Course, nodeId: string, vars: Record<string, unknown>, doc = usePreview.getState().doc): Promise<Verdict> {
  const verdict = await judgeNode(course, nodeId, vars, judgeSettings(), (url, body, timeout) => native.aiPost(url, body, timeout));
  const usage = ((verdict.http?.json as { usage?: Record<string, number> })?.usage ?? {}) as Record<string, number>;
  usePreview.getState().log({
    node: nodeId,
    kind: "judge",
    endpoint: "decisions",
    model: verdict.model,
    answered: verdict.answered ?? "",
    tokensIn: usage.input_tokens ?? null,
    tokensOut: usage.output_tokens ?? null,
    cost: typeof usage.cost === "number" ? usage.cost : null,
    ms: verdict.http?.ms ?? 0,
    ok: verdict.judged,
    note: verdict.reason ?? "",
    request: verdict.body ?? null,
    response: verdict.http?.raw ?? "",
  }, doc);
  if (!verdict.judged) usePreview.getState().noteNotJudged(nodeId, verdict.reason ?? "", doc);
  return verdict;
}

export async function answer(course: Course, state: PlayerState | null, rawBody: string): Promise<Reply> {
  const doc = usePreview.getState().doc;
  let prompt = "";
  try {
    prompt = String(JSON.parse(rawBody)?.messages?.[0]?.content ?? "");
  } catch {
    return failure("unknown request", 400);
  }
  const vars = state?.vars ?? {};
  const lang = state?.lang ?? course.info["source-language"];

  const marker = /^#edukors:((?:c|s|n)[0-9]+)$/.exec(prompt.trim());
  if (marker) {
    const nodeId = marker[1];
    const node = course.nodes.find((n) => n.id === nodeId);
    if (!node || !isJudge(node.type)) return failure(`node ${nodeId} is not a node the AI judges`, 400);
    const forced = usePreview.getState().forced[nodeId];
    if (forced) {
      try {
        const forcedResult = forcedVars(node, forced);
        usePreview.getState().log({ node: nodeId, kind: "judge", endpoint: "forced", model: "—", answered: "—", tokensIn: null, tokensOut: null, cost: null, ms: 0, ok: true, note: t("preview.forced"), request: forced, response: JSON.stringify(forcedResult) });
        return text(JSON.stringify({ judged: true, vars: forcedResult }));
      } catch (e) {
        usePreview.getState().noteNotJudged(nodeId, `${t("preview.forced")}: ${errorText(e)}`);
        return text(JSON.stringify({ judged: false, vars: {} }));
      }
    }
    const verdict = await judgeAndLog(course, nodeId, vars, doc);
    return text(JSON.stringify({ judged: verdict.judged, vars: verdict.judged ? verdict.vars : {} }));
  }

  // A step to write: the one the student is on.
  const nodeId = state?.currentId ?? "";
  const node = course.nodes.find((n) => n.id === nodeId);
  if (!node || !isDynamic(node.type)) return failure("no step to write");
  const ai = usePrefs.getState().ai;
  try {
    const request = buildGeneration(course, nodeId, lang, vars, { model: ai.model, temperature: ai.temperature, maxTokens: ai.maxTokens });
    const result = await chatBody(request.body, { node: nodeId, kind: "generate" }, doc);
    return text(result.text);
  } catch (e) {
    return failure((e as Error).message);
  }
}
