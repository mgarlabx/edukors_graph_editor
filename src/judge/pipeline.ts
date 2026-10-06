/**
 * How the server writes a step and judges a node, ported from the player's
 * src/ai.php so the preview and the judge probe make the calls it makes and
 * accept only the answers it accepts.
 *
 * Every function names its PHP twin. The rules are the server's: nothing is
 * repaired, a confidence under the floor or a model that is not the one asked
 * for means "not judged", and a judgement that did not happen produces no key
 * at all. tests/judge.parity.test.ts runs these against ai.php itself.
 */
import type { Course, CourseNode } from "../schema/types";
import { isJudge } from "../course/nodeTypes";
import { localize } from "../course/localize";
import { fill, type Params } from "../i18n";
import { errorText, Said } from "../i18n/errors";

export type Vars = Record<string, unknown>;

export const JUDGE_SPREAD = "~spread";

/**
 * Why a call came to nothing: ai.php's words, word for word, with {name} where
 * it puts a value. The interface says them from the locales (ai.why.<code>).
 */
const WHY = {
  "not-writer": "node {node} is not a node the AI writes",
  "no-prompt": "node {node} has no prompt",
  "not-judge": "node {node} is not a node the AI judges",
  "no-model": "this server has no judge.model configured.",
  alias: 'judge.model "{model}" is an alias, not a version.',
  "not-unit": 'question "{key}" came back with {value}, which is not a number from 0 to 1.',
  "no-confidence": 'question "{key}" came back without a confidence.',
  "no-probabilities": 'question "{key}" came back with no probabilities.',
  "label-missing": 'question "{key}" left "{label}" out of its probabilities.',
  "label-not-number": 'question "{key}" gave "{label}" something that is not a number.',
  "label-unknown": 'question "{key}" put weight on "{label}", which is not one of its labels.',
  "not-one": 'question "{key}" added up to {sum}, not to 1.',
  unanswered: 'question "{key}" was not answered.',
  "no-number": 'question "{key}" came back without a number.',
  "no-options": 'question "{key}" has no options to be answered with.',
  "no-choice": 'question "{key}" chose nothing.',
  "choice-unknown": 'question "{key}" answered "{choice}", which is not one of its options.',
  "no-scale": 'question "{key}" has no scale to be answered on.',
  "no-level": 'question "{key}" came back without a level.',
  "off-scale": 'question "{key}" came back at {score}, which is off a scale of {levels} levels.',
  "under-floor": 'question "{key}" came back at {sure}, under this server\'s floor of {floor}.',
  unreachable: "could not reach the model: {error}",
  unreadable: "the model returned something unreadable",
  refused: "{error}",
  "other-model": 'the answer came back from "{answered}", which is not the "{model}" named in judge.model.',
  "no-answers": "the model answered nothing.",
};

type Why = keyof typeof WHY;

const said = (code: Why, params: Params = {}) => new Said(fill(WHY[code], params), `ai.why.${code}`, params);

/** AiNotJudged: a judgement that did not happen, and why. */
export class NotJudged extends Said {
  constructor(code: Why, params: Params = {}) {
    super(fill(WHY[code], params), `ai.why.${code}`, params);
  }
}

/** Course::text() — a value as the server writes it into a prompt. */
const text = (value: unknown): string => {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return value.map(text).join(",");
  return String(value);
};

/** Course::resolveStorage() — {{STORAGE: key}} filled in from the student's work. */
export const resolveStorage = (prompt: string, vars: Vars): string =>
  String(prompt ?? "").replace(/\{\{\s*STORAGE:\s*([^}]+?)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key.trim()];
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(text).join(", ");
    return text(value);
  });

/**
 * PHP's round() as of 8.4: half away from zero, where "half" means the double
 * nearest the decimal midpoint -- so 7.575 rounds up and 7.5749999999999993,
 * which prints the same, rounds down. Checked against PHP 8.5 on 20,000 values.
 */
export const phpRound = (value: number, places = 0): number => {
  const f = 10 ** places;
  const a = Math.abs(value);
  let lo = Math.floor(a * f);
  if (lo / f > a) lo -= 1;
  if ((lo + 1) / f <= a) lo += 1;
  const n = a >= (lo + 0.5) / f ? lo + 1 : lo;
  return (Math.sign(value) * n) / f || 0;
};

/** PHP's is_numeric(): a number, or a text that reads as one. */
const isNumeric = (v: unknown): boolean =>
  (typeof v === "number" && Number.isFinite(v)) ||
  (typeof v === "string" && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(v));

/** A float as PHP prints it in a message: 0.7, 3, 0.30000000000000004. */
const phpFloat = (n: number): string => (Number.isInteger(n) ? String(n) : String(n));

/** ai_judge_number() — a number as JavaScript prints it. */
const judgeNumber = (value: unknown): string => {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (!isNumeric(value)) return String(value);
  return String(Number(value));
};

/**
 * ai_judgement_block() / the player's Ai.judgement: the judgement as the node
 * that writes from it receives it.
 */
export const judgementBlock = (judge: CourseNode, vars: Vars): string => {
  const id = judge.id;
  const content = judge.content ?? {};
  const lines = [
    "--- THE JUDGEMENT ALREADY MADE ---",
    "",
    "This was decided by a separate model against the scale written below. " +
      "It is settled: explain it, do not revisit it.",
    "",
    "What was judged:",
  ];
  for (const [field, value] of Object.entries(content.state ?? {})) {
    const t = Array.isArray(value) ? value.join(", ") : String(value);
    lines.push(`  ${field}: ${resolveStorage(t, vars)}`);
  }
  for (const item of content.items ?? []) {
    const key = String(item?.key ?? "");
    const value = vars[`${id}.${key}`];
    if (value === null || value === undefined) continue;
    lines.push("", `Question "${key}": ${String(item?.instructions ?? "")}`);
    const scale = judge.type === "score" && Array.isArray(item?.criteria) ? (item.criteria as string[]) : null;
    const spread = vars[`${id}.${key}${JUDGE_SPREAD}`] as Record<string, number> | undefined;
    if (scale) {
      lines.push(`  Level reached: ${judgeNumber(value)} on a scale of 0 to ${scale.length - 1}`);
      scale.forEach((t, level) => {
        const weight = spread && typeof spread === "object" ? spread[String(level)] : undefined;
        const share = weight === null || weight === undefined ? "" : `  (${phpRound(100 * Number(weight))}% of the weight)`;
        const nearest = phpRound(Number(value)) === level ? "  <- nearest level" : "";
        lines.push(`    ${level} - ${t}${share}${nearest}`);
      });
    } else {
      lines.push(`  Answer: ${judgeNumber(value)}`);
    }
    const points = vars[`${id}.${key}-points`];
    if (points !== null && points !== undefined) lines.push(`  Points: ${judgeNumber(points)}`);
    const confidence = vars[`${id}.${key}-confidence`];
    if (confidence !== null && confidence !== undefined) lines.push(`  How sure the model is: ${judgeNumber(confidence)}`);
  }
  const total = vars[`${id}.total`];
  if (total !== null && total !== undefined)
    lines.push("", `Total: ${judgeNumber(total)} points (${judgeNumber(vars[`${id}.percent`] ?? 0)}% of the highest possible)`);
  return lines.join("\n");
};

// ------------------------------------------------------------- writing ----

export interface GenerationSettings {
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatRequest {
  system: string;
  user: string;
  body: Record<string, unknown>;
}

/** ai_write_step() + ai_call(), up to the request they send. */
export const buildGeneration = (
  course: Course,
  nodeId: string,
  lang: string,
  vars: Vars,
  settings: GenerationSettings,
): ChatRequest => {
  const node = course.nodes.find((n) => n.id === nodeId);
  if (!node || (node.type !== "dynamic-md" && node.type !== "dynamic-html"))
    throw said("not-writer", { node: nodeId });
  let prompt = localize(node.content?.prompt ?? [], lang);
  if (prompt.trim() === "") throw said("no-prompt", { node: nodeId });
  prompt = resolveStorage(prompt, vars);
  const judge = course.nodes.find((n) => n.id === String(node.content?.from ?? ""));
  if (judge) prompt += "\n\n" + judgementBlock(judge, vars);

  const system = `${course.info?.["system-prompt"] ?? ""}\n\nThe student's language is "${lang}". Answer in that language.`.trim();
  return {
    system,
    user: prompt,
    body: {
      model: settings.model,
      max_tokens: Math.trunc(settings.maxTokens),
      temperature: Number(settings.temperature),
      usage: { include: true },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
  };
};

// ------------------------------------------------------------- judging ----

export interface JudgeSettings {
  model: string;
  minConfidence: number;
  strictModel: boolean;
  url: string;
  timeout: number;
}

/** ai_judge_model(): the slug, refused when it is an alias rather than a version. */
export const judgeModel = (slug: string): string => {
  const s = slug.trim();
  if (s === "") throw new NotJudged("no-model");
  if (/(latest|preview|newest)$/i.test(s) || !/[0-9]/.test(s)) throw new NotJudged("alias", { model: s });
  return s;
};

/** ai_judge_state() / JudgeView.request(): the state with every key filled in. */
export const judgeState = (content: CourseNode["content"], vars: Vars): Record<string, string | string[]> => {
  const state: Record<string, string | string[]> = {};
  for (const [field, value] of Object.entries(content?.state ?? {}))
    state[field] = Array.isArray(value) ? value.map((p) => resolveStorage(String(p), vars)) : resolveStorage(String(value), vars);
  return state;
};

const empty = (v: unknown) =>
  v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** ai_judge_body(): {model, state, questions}, and a pinned route. */
export const judgeBody = (type: string, items: Record<string, unknown>[], state: unknown, model: string) => {
  const questions: Record<string, Record<string, unknown>> = {};
  for (const item of items) {
    const q: Record<string, unknown> = { type, instructions: String(item.instructions ?? "") };
    if (!empty(item.criteria)) q.criteria = item.criteria;
    questions[String(item.key ?? "")] = q;
  }
  return { model, state, questions, provider: { allow_fallbacks: false } };
};

/** ai_judge_same_model(): exact, or the same slug with a build date. */
export const sameModel = (answered: string, asked: string): boolean =>
  answered === asked || new RegExp(`^${asked.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}-\\d{8}$`).test(answered);

const unit = (key: string, value: number): number => {
  if (value < 0 || value > 1) throw new NotJudged("not-unit", { key, value: phpFloat(value) });
  return value;
};

const confidence = (key: string, given: Record<string, unknown>): number => {
  if (!isNumeric(given.confidence)) throw new NotJudged("no-confidence", { key });
  return unit(key, Number(given.confidence));
};

const spreadOf = (key: string, given: Record<string, unknown>, labels: string[]): Record<string, number> => {
  const spread = given.probabilities;
  if (!spread || typeof spread !== "object" || Object.keys(spread).length === 0)
    throw new NotJudged("no-probabilities", { key });
  const found = new Map<string, unknown>(Object.entries(spread as object).map(([k, v]) => [String(k), v]));
  const read: Record<string, number> = {};
  let sum = 0;
  for (const label of labels) {
    if (!found.has(label)) throw new NotJudged("label-missing", { key, label });
    const w = found.get(label);
    if (!isNumeric(w)) throw new NotJudged("label-not-number", { key, label });
    read[label] = unit(key, Number(w));
    sum += read[label];
    found.delete(label);
  }
  for (const [label, weight] of found)
    if (isNumeric(weight) && Number(weight) > 0)
      throw new NotJudged("label-unknown", { key, label });
  const slack = Math.max(0.02, 0.005 * labels.length);
  if (Math.abs(sum - 1) > slack) throw new NotJudged("not-one", { key, sum: phpFloat(phpRound(sum, 3)) });
  return read;
};

export interface ReadAnswer {
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

/** ai_judge_read(): every answer checked against the question it was asked of. */
export const readAnswers = (answers: unknown, type: string, items: Record<string, unknown>[]): Record<string, ReadAnswer> => {
  const all = answers && typeof answers === "object" ? (answers as Record<string, unknown>) : {};
  const read: Record<string, ReadAnswer> = {};
  for (const item of items) {
    const key = String(item.key ?? "");
    const given = all[key];
    if (!given || typeof given !== "object") throw new NotJudged("unanswered", { key });
    const g = given as Record<string, unknown>;
    if (type === "noul") {
      if (!isNumeric(g.noul)) throw new NotJudged("no-number", { key });
      read[key] = { noul: unit(key, Number(g.noul)) };
    } else if (type === "choice") {
      const options = item.criteria && typeof item.criteria === "object" ? Object.keys(item.criteria).map(String) : [];
      if (!options.length) throw new NotJudged("no-options", { key });
      const choice = typeof g.choice === "string" ? g.choice.trim() : "";
      if (choice === "") throw new NotJudged("no-choice", { key });
      if (!options.includes(choice)) throw new NotJudged("choice-unknown", { key, choice });
      read[key] = { choice, confidence: confidence(key, g), probabilities: spreadOf(key, g, options) };
    } else {
      const levels = Array.isArray(item.criteria) ? item.criteria.length : 0;
      if (levels < 2) throw new NotJudged("no-scale", { key });
      if (!isNumeric(g.score)) throw new NotJudged("no-level", { key });
      const score = Number(g.score);
      if (score < 0 || score > levels - 1)
        throw new NotJudged("off-scale", { key, score: phpFloat(score), levels });
      read[key] = {
        score,
        confidence: confidence(key, g),
        probabilities: spreadOf(key, g, Array.from({ length: levels }, (_, i) => String(i))),
      };
    }
  }
  return read;
};

/** ai_judge_vars(): the storage keys a judgement produces. */
export const judgeVars = (
  nodeId: string,
  type: string,
  content: CourseNode["content"],
  read: Record<string, ReadAnswer>,
  floor: number,
): Vars => {
  const items: Record<string, unknown>[] = Array.isArray(content?.items) ? content.items : [];
  const vars: Vars = {};
  let total = 0;
  let possible = 0;
  let scoredAny = false;
  for (const item of items) {
    const key = String(item.key ?? "");
    const answer = read[key] ?? {};
    if (type === "noul") {
      vars[`${nodeId}.${key}`] = phpRound(Number(answer.noul), 2);
      continue;
    }
    const sure = phpRound(Number(answer.confidence), 3);
    if (sure < floor) throw new NotJudged("under-floor", { key, sure: phpFloat(sure), floor: phpFloat(floor) });
    if (type === "choice") {
      vars[`${nodeId}.${key}`] = String(answer.choice);
      vars[`${nodeId}.${key}-confidence`] = sure;
      continue;
    }
    const criteria = Array.isArray(item.criteria) ? item.criteria : [];
    const chance = answer.probabilities ?? {};
    vars[`${nodeId}.${key}`] = phpRound(Number(answer.score), 2);
    vars[`${nodeId}.${key}-confidence`] = sure;
    vars[`${nodeId}.${key}${JUDGE_SPREAD}`] = Object.fromEntries(Object.entries(chance).map(([l, w]) => [l, phpRound(Number(w), 2)]));
    const points = item.points;
    if (Array.isArray(points) && criteria.length && points.length === criteria.length) {
      let earned = 0;
      points.forEach((worth, i) => (earned += Number(worth) * Number(chance[String(i)] ?? 0)));
      vars[`${nodeId}.${key}-points`] = phpRound(earned, 2);
      total += earned;
      possible += Math.max(...points.map(Number));
      scoredAny = true;
    }
  }
  if (scoredAny) {
    vars[`${nodeId}.total`] = phpRound(total, 2);
    vars[`${nodeId}.percent`] = possible > 0 ? phpRound((total / possible) * 100) : 0;
  }
  return vars;
};

export interface HttpAnswer {
  status: number;
  json: unknown;
  raw: string;
  error: string | null;
  ms: number;
}

export type Post = (url: string, body: unknown, timeout: number) => Promise<HttpAnswer>;

export interface Verdict {
  judged: boolean;
  vars: Vars;
  /** Why it was not judged, in the interface's language. */
  reason: string | null;
  model: string;
  body?: unknown;
  answered?: string;
  answers?: unknown;
  http?: HttpAnswer;
}

/** ai_judge_node(): the whole judgement, with nothing kept. */
export async function judgeNode(course: Course, nodeId: string, vars: Vars, settings: JudgeSettings, post: Post): Promise<Verdict> {
  const node = course.nodes.find((n) => n.id === nodeId);
  if (!node || !isJudge(node.type)) throw said("not-judge", { node: nodeId });
  const items: Record<string, unknown>[] = Array.isArray(node.content?.items) ? node.content.items : [];
  const verdict: Verdict = { judged: false, vars: {}, reason: null, model: settings.model };
  try {
    const model = judgeModel(settings.model);
    const state = judgeState(node.content, vars);
    const body = judgeBody(node.type, items, state, model);
    verdict.body = body;

    const http = await post(settings.url, body, settings.timeout);
    verdict.http = http;
    if (http.error !== null) {
      if (http.status === 0) throw new NotJudged("unreachable", { error: http.error });
      if (http.json === null) throw new NotJudged("unreadable");
      throw new NotJudged("refused", { error: http.error });
    }
    const json = (http.json ?? {}) as Record<string, unknown>;
    const answers = json.answers && typeof json.answers === "object" ? json.answers : {};
    const answered = String(json.model ?? "");
    verdict.answered = answered;
    verdict.answers = answers;
    if (settings.strictModel && answered !== "" && !sameModel(answered, model))
      throw new NotJudged("other-model", { answered, model });
    if (Object.keys(answers as object).length === 0) throw new NotJudged("no-answers");

    verdict.vars = judgeVars(nodeId, node.type, node.content, readAnswers(answers, node.type, items), settings.minConfidence);
    verdict.judged = true;
  } catch (e) {
    verdict.judged = false;
    verdict.vars = {};
    verdict.reason = errorText(e);
  }
  return verdict;
}
