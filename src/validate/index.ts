import { schemaIssues } from "../schema/ajv";
import { hasKey, t } from "../i18n";
import { validateRules, type Issue, type RulesResult } from "./rules";

export type { Issue } from "./rules";

/** Params that are words of the sentence ("title", "this quiz"), not values from the course. */
const WORDS = new Set(["label", "scope"]);

/** What an issue says, in the interface's language. */
export const issueText = (i: Issue): string => {
  if (!hasKey(i.code)) return i.message;
  const params = Object.fromEntries(
    Object.entries(i.params).map(([k, v]) => [k, WORDS.has(k) ? t(`rule.word.${String(v).replace(/ /g, "-")}`) : v]),
  );
  return t(i.code, params);
};

/** Where an issue points, with its first word in the interface's language: "node q1.title" -> "nó q1.title". */
export const issueWhere = (i: Issue): string =>
  i.where.replace(/^(node|edge|graph|translations|quizzes|course)\b/, (word) => t(`where.${word}`));

export interface Diagnostics extends RulesResult {
  errors: number;
  warnings: number;
  byNode: Map<string, Issue[]>;
  byEdge: Map<number, Issue[]>;
}

const area = (i: Issue) => (i.node ? `n:${i.node}` : i.edge !== undefined ? `e:${i.edge}` : i.where.split(/[.[]/)[0]);

/**
 * Both layers. The port of validate_course.py speaks first; a schema error is
 * shown only where the port found nothing wrong, because most of the time the
 * two are describing the same mistake and the port says it better.
 */
export function diagnose(course: unknown): Diagnostics {
  const rules = validateRules(course);
  const ruled = new Set(rules.issues.filter((i) => i.level === "error").map(area));
  const schema = schemaIssues(course).filter((i) => !ruled.has(area(i)));
  const issues = [...rules.issues.filter((i) => i.level === "error"), ...schema, ...rules.issues.filter((i) => i.level === "warning")];

  const byNode = new Map<string, Issue[]>();
  const byEdge = new Map<number, Issue[]>();
  for (const i of issues) {
    if (i.node) byNode.set(i.node, [...(byNode.get(i.node) ?? []), i]);
    if (i.edge !== undefined) byEdge.set(i.edge, [...(byEdge.get(i.edge) ?? []), i]);
  }
  return {
    ...rules,
    issues,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    byNode,
    byEdge,
  };
}
