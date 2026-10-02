/**
 * Layer 2: a line-by-line port of validate_course.py.
 *
 * The messages are the script's own, word for word, so that the editor and the
 * builder say the same thing about the same course; tests/validate.parity.test.ts
 * runs both over the samples and over courses broken on purpose and compares
 * the output. Anything changed in the script must be changed here, and in the
 * rule.* rows of scripts/strings_table.py (tests/errors.test.ts checks them).
 *
 * Besides the lines, every issue carries where it points -- a node, an edge --
 * so the canvas can mark it and the problems panel can jump to it, and the key
 * the interface shows it by, in its own language (rule.<code> in the locales).
 */
import { fill, type Params } from "../i18n";
import { blank, isDict, repr, sorted, str, typeName, wholeNumber, words } from "./py";

export type Level = "error" | "warning";

export interface Issue {
  level: Level;
  where: string;
  /** In English, as validate_course.py prints it; what the agent reads. */
  message: string;
  /** The same in the interface's language: a key of the locales, and what fills it. */
  code: string;
  params: Params;
  node?: string;
  edge?: number;
  /** Which layer found it: the rules of this port, or the schema through Ajv. */
  source: "rules" | "schema";
}

export interface RulesResult {
  issues: Issue[];
  /** storage key -> id of the node that produces it */
  produced: Map<string, string>;
  /** score node id -> question key -> number of levels */
  scoreLevels: Map<string, Map<string, number>>;
  /** node ids in file order, without duplicates */
  order: string[];
  langs: string[];
  reachable: Set<string>;
}

const LANG_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const ID_RE = /^(sm|sh|dm|dh|q|f|b|c|s|n)[0-9]+$/;
const NAME_RE = /^[a-z][a-z0-9-]*$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const KEY_RE = /^(dm|dh|q|f|b|c|s|n)[0-9]+\.[a-z][a-z0-9-]*$/;
const STORAGE_RE = () => /\{\{\s*STORAGE:\s*([^}]+?)\s*\}\}/g;

const PREFIX: Record<string, string> = {
  "static-md": "sm",
  "static-html": "sh",
  "dynamic-md": "dm",
  "dynamic-html": "dh",
  quiz: "q",
  form: "f",
  bool: "b",
  choice: "c",
  score: "s",
  noul: "n",
};
const NODE_TYPES = new Set(Object.keys(PREFIX));
const JUDGE_TYPES = ["choice", "score", "noul"];
const JUDGE_SUFFIXES = ["-confidence", "-points"];
const JUDGE_RESERVED = ["total", "percent"];
const JUDGING_RE =
  /\b(grade[sd]?|grading|scores?|scored|scoring|judges?|judged|judging|evaluat(?:e[sd]?|ing)|rates?|rated|rating|assess(?:es|ed|ing)?)\b/i;
const OPERATORS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "not-contains"]);
const FIELD_TYPES = new Set(["text-line", "text-area", "radio", "check", "select"]);
const CHOICE_TYPES = new Set(["radio", "check", "select"]);

const INFO_REQUIRED = ["course-id", "source-language", "other-languages", "title", "author", "version", "date", "start"];
const INFO_OPTIONAL = ["description", "sections", "system-prompt"];
const NODE_REQUIRED = ["id", "type", "title", "content"];
const NODE_OPTIONAL = ["section"];

const CONTENT_FIELDS: Record<string, [string[], string[]]> = {
  "static-md": [["item"], []],
  "static-html": [["item"], []],
  "dynamic-md": [["prompt"], ["from"]],
  "dynamic-html": [["prompt"], ["from"]],
  quiz: [["items"], []],
  form: [["items"], ["instructions"]],
  bool: [["question"], ["yes-label", "no-label", "default"]],
  choice: [["state", "items"], []],
  score: [["state", "items"], []],
  noul: [["state", "items"], []],
};

/**
 * The script's messages, word for word, with {name} where it puts a value. The
 * interface shows the ones in the locales instead (rule.<code>), which take the
 * same names.
 */
const MESSAGES = {
  "translations": "{count} text(s) have no '{lang}' version ({sample})",
  "translations-more": "{count} text(s) have no '{lang}' version ({sample} and {more} more)",
  "not-object": "expected an object, found {type}",
  "missing-field": "missing required field '{key}'",
  "unknown-field": "unknown field '{key}' (the format allows no extra fields)",
  "localized-list": "{label} must be a non-empty list of {lang, text} objects",
  "localized-entry": "each entry must be an object with 'lang' and 'text'",
  "unknown-fields": "unknown field(s) {fields}",
  "lang-code-example": "invalid language code {value} (expected e.g. 'pt', 'en', 'pt-BR')",
  "lang-twice": "language '{lang}' appears twice",
  "lang-undeclared": "language '{lang}' is not declared in info",
  "text-string": "'text' must be a string",
  "text-empty": "empty {label}",
  "source-missing": "missing the source language '{lang}'",
  "lang-code": "invalid language code {value}",
  "other-languages-list": "must be a list (use [] when there are no translations)",
  "lang-is-source": "'{lang}' is the source language and must not be repeated here",
  "lang-repeated": "'{lang}' appears twice",
  "uuid": "must be a UUID, found {value}",
  "non-empty-string": "must be a non-empty string",
  "version": "must be MAJOR.MINOR.PATCH, found {value}",
  "date-format": "must be YYYY-MM-DD, found {value}",
  "date-real": "must be a real date, found {value}",
  "start-id": "invalid node id {value}",
  "list": "must be a list",
  "section-number": "'number' must be an integer >= 1, found {value}",
  "section-twice": "section number {number} is declared twice",
  "system-prompt-language": "does not mention the student's language; add 'Answer in the student's language.'",
  "quiz-empty": "a quiz needs at least one question",
  "key-name": "invalid 'key' {value} (lowercase letters, digits and hyphens)",
  "quiz-key-reserved": "'key' cannot be '{key}' — the quiz already produces it",
  "quiz-key-twice": "key '{key}' is used twice in this quiz",
  "question-options": "a question needs at least two options",
  "value-name": "invalid 'value' {value} (lowercase letters, digits and hyphens)",
  "question-value-twice": "option value '{value}' is used twice in this question",
  "correct-bool": "'correct' must be true or false",
  "one-correct": "exactly one option must be correct, found {count}",
  "spread-all": "the correct answer is option {letter} in every question of {scope} — shuffle the options",
  "spread-most": "the correct answer is option {letter} in {hits} of {total} questions of {scope} — spread it out",
  "form-empty": "a form needs at least one field",
  "form-assignment":
    "a single text-area and no 'instructions': a writing task needs its assignment -- " +
    "what to write, how long, and what will be judged",
  "form-key-twice": "field key '{key}' is used twice in this form",
  "field-type": "invalid field type {value} (one of {allowed})",
  "required-bool": "'required' must be true or false",
  "words-not-counted": "a '{type}' field counts no words, so it takes no '{bound}'",
  "words-whole": "'{bound}' must be a whole number >= 1, found {value}",
  "words-crossed": "'max-words' ({max}) is below 'min-words' ({min}): no answer can satisfy both",
  "field-options": "a '{type}' field needs at least two options",
  "value-invalid": "invalid 'value' {value}",
  "field-value-twice": "option value '{value}' is used twice in this field",
  "field-no-options": "a '{type}' field must not have options",
  "points-list": "must be a list of numbers, one per level of 'criteria'",
  "number": "must be a number, found {value}",
  "non-negative": "must be 0 or more, found {value}",
  "points-count": "{points} point value(s) for {levels} level(s): there must be exactly one per level, in the same order",
  "points-order":
    "the points do not rise with the levels ({points}): a higher " +
    "level worth less than a lower one is almost always a typo",
  "choice-criteria": "must be a map of the name of each option to what it covers",
  "choice-few": "a choice needs at least two options",
  "choice-many": "a choice takes at most 255 options, got {count}",
  "choice-option-name": "the option '{name}' must be a name the edges can compare to: lowercase letters, digits and -",
  "choice-option-text": "must be a text saying what the option covers, or null",
  "score-criteria": "must be the levels of the scale, in order, from the low end to the high end",
  "score-levels": "a scale has between 2 and 10 levels, got {count}",
  "score-level-text": "each level must say what it means",
  "noul-criteria": "must say what 'true' and what 'false' cover",
  "noul-criteria-field": "'{name}' is not a field here: only 'true' and 'false' are",
  "non-empty-text": "must be a non-empty text",
  "state-object":
    "the state the AI judges must be an object of named fields, e.g. " +
    '{"task": "...", "answer": "{{STORAGE: f1.text}}"}',
  "state-field-name": "a field name is lowercase letters, digits and hyphens",
  "text": "must be a text",
  "text-or-list": "must be a text, or a list of texts",
  "state-no-storage":
    "the state reads no {{STORAGE: key}}, so the AI judges the same thing for every " +
    "student and the node always takes the same edge",
  "judge-empty": "a judgement node needs at least one question",
  "judge-key": "must be a name like 'track': lowercase letters, digits and -",
  "judge-key-suffix": "cannot end in '{suffix}': the node produces that key on its own",
  "judge-key-reserved": "'{key}' is what a score node produces for the whole node; name the question after what it judges",
  "judge-key-twice": "'{key}' is used twice in the same node",
  "judge-instructions": "the question the AI answers must be a non-empty string",
  "node-object": "each node must be an object",
  "node-type": "invalid type {value} (one of {allowed})",
  "node-id": "invalid id {value}",
  "node-id-twice": "two nodes use this id",
  "node-prefix": "id does not match type '{type}' (expected prefix '{prefix}')",
  "node-section": "'section' must be an integer >= 1, found {value}",
  "section-undeclared": "section {number} is not declared in info.sections",
  "content-short": "content is very short ({count} words) for a teaching node",
  "from-id": "must be the id of a choice, score or noul node, found {value}",
  "from-judging":
    "writes from the judgement of {judge} but its prompt says '{word}': " +
    "the level is already settled, and a feedback that judges again can " +
    "contradict the number that routed the student -- tell it how to write, " +
    "not what to decide",
  "dynamic-static": "dynamic node whose prompt reads no {{STORAGE: key}} — nothing personalises it, consider making it static",
  "true-false": "must be true or false",
  "condition-deep": "condition nested too deeply",
  "when-object": "'when' must be an object",
  "group-only": "an '{joiner}' condition must contain only '{joiner}', found {fields}",
  "group-list": "must be a list of at least two conditions",
  "condition-unknown": "unknown field(s) {fields} in condition",
  "condition-missing": "condition is missing '{field}'",
  "condition-key": "invalid key {value} (expected '<node-id>.<name>', e.g. 'q1.percent')",
  "condition-operator": "invalid operator {value} (one of {allowed})",
  "condition-value": "'value' must be a string, number or boolean",
  "schema-string": "must be a string (the address of the schema)",
  "non-empty-list": "must be a non-empty list",
  "state-reads-mark":
    "the state field '{name}' reads '{key}', a mark already given: the AI would " +
    "anchor on it instead of judging for itself -- give the judgement the work " +
    "and the task, not an earlier verdict",
  "from-missing": "writes from '{from}', which is not a node",
  "from-not-judge": "writes from '{from}', which is a {type} node and makes no judgement",
  "edge-from": "'from' points to {value}, which is not a node",
  "edge-to": "'to' points to {value}, which is not a node",
  "judge-no-fallback":
    "every outgoing edge is conditional; a judgement the AI could not make leaves " +
    "the student with nowhere to go — add an unconditional fallback edge last",
  "no-fallback":
    "every outgoing edge is conditional; a student matching none of them gets stuck — " +
    "add an unconditional fallback edge last",
  "fallbacks": "{count} unconditional edges; only the first can ever be taken",
  "fallback-not-last": "the unconditional edge is not last: the following {count} edge(s) are unreachable",
  "fallback-to-feedback":
    "its unconditional edge leads to {target}, which writes from this very " +
    "judgement -- that edge is the path taken when no judgement was made, so " +
    "{target} would have nothing to write from; send the fallback elsewhere",
  "unreachable": "no path from the start node reaches: {nodes} (usually a missing edge into them)",
  "start-missing": "start node '{start}' does not exist",
  "endings": "several nodes end the course: {nodes} — branches should reunite unless every one of these is a real ending",
  "from-bypassed":
    "writes from the judgement of {judge}, but there is a path to it that never " +
    "passes through {judge}: a student taking that path would reach a node with no " +
    "judgement to write from",
  "key-unproduced": "condition reads '{key}', which no node produces",
  "key-not-upstream": "'{key}' is produced by {producer}, which is not on any path to {reader}; this condition can never hold",
  "key-levels":
    "'{key}' runs from 0 to {top}, over the levels of its own question, so " +
    "comparing it against {value} never holds. For a grade out of 100 give the " +
    "question 'points' and test {owner}.percent",
  "storage-invalid": "{{STORAGE: {key}}} is not a valid key ('<node-id>.<name>')",
  "storage-unproduced": "{{STORAGE: {key}}} reads a key no node produces",
  "storage-not-upstream":
    "{{STORAGE: {key}}} is produced by {producer}, which the student may not " +
    "have reached before {node}; the value will be empty",
  "data-unused": "stores data no edge and no prompt ever reads — branch on it or use it in a prompt",
};

export type Code = keyof typeof MESSAGES;
export const RULE_CODES = Object.keys(MESSAGES) as Code[];
export const ruleTemplate = (code: Code) => MESSAGES[code];

type Dict = Record<string, unknown>;
type Slot = [string, number, number];

class Report {
  errors: Issue[] = [];
  warnings: Issue[] = [];
  missing = new Map<string, string[]>();
  correctSlots: Slot[] = [];

  error(where: string, code: Code, params: Params = {}, edge?: number) {
    this.errors.push(issue("error", where, code, params, edge));
  }

  warn(where: string, code: Code, params: Params = {}, edge?: number) {
    this.warnings.push(issue("warning", where, code, params, edge));
  }

  missingTranslation(lang: string, where: string) {
    const places = this.missing.get(lang) ?? [];
    places.push(where);
    this.missing.set(lang, places);
  }

  finish() {
    for (const lang of sorted(this.missing.keys())) {
      const places = this.missing.get(lang)!;
      const sample = places.slice(0, 3).join(", ");
      const params = { count: places.length, lang, sample, more: places.length - 3 };
      this.warn("translations", places.length > 3 ? "translations-more" : "translations", params);
    }
  }
}

const NODE_WHERE = /^node ([a-z]+[0-9]+)/;
const issue = (level: Level, where: string, code: Code, params: Params, edge?: number): Issue => {
  const node = NODE_WHERE.exec(where)?.[1];
  return { level, where, message: fill(MESSAGES[code], params), code: `rule.${code}`, params, node, edge, source: "rules" };
};

const has = (obj: Dict, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

function checkKeys(obj: unknown, where: string, required: string[], optional: string[], rep: Report): obj is Dict {
  if (!isDict(obj)) {
    rep.error(where, "not-object", { type: typeName(obj) });
    return false;
  }
  for (const key of required) if (!has(obj, key)) rep.error(where, "missing-field", { key });
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(obj))
    if (!allowed.has(key)) rep.error(where, "unknown-field", { key });
  return true;
}

function checkLocalized(
  value: unknown,
  where: string,
  rep: Report,
  langs: string[] | null,
  requiredLangs: string[] | null = null,
  label = "text",
) {
  if (!Array.isArray(value) || value.length === 0) {
    rep.error(where, "localized-list", { label });
    return;
  }
  const seen: string[] = [];
  value.forEach((entry, i) => {
    const spot = `${where}[${i}]`;
    if (!isDict(entry)) {
      rep.error(spot, "localized-entry");
      return;
    }
    const extra = Object.keys(entry).filter((k) => k !== "lang" && k !== "text");
    if (extra.length) rep.error(spot, "unknown-fields", { fields: repr(sorted(extra)) });
    const lang = entry.lang;
    if (typeof lang !== "string" || !LANG_RE.test(lang)) {
      rep.error(spot, "lang-code-example", { value: repr(lang) });
    } else {
      if (seen.includes(lang)) rep.error(spot, "lang-twice", { lang });
      seen.push(lang);
      if (langs && langs.length && !langs.includes(lang)) rep.warn(spot, "lang-undeclared", { lang });
    }
    const text = entry.text;
    if (typeof text !== "string") rep.error(spot, "text-string");
    else if (blank(text)) rep.warn(spot, "text-empty", { label });
  });
  (requiredLangs ?? []).forEach((lang, i) => {
    if (!seen.includes(lang)) {
      if (i === 0) rep.error(where, "source-missing", { lang });
      else rep.missingTranslation(lang, where);
    }
  });
}

function localizedTexts(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isDict).map((e) => (has(e, "text") ? (e.text as string) : ""));
  if (typeof value === "string") return [value];
  return [];
}

function validateInfo(info: unknown, rep: Report): [string[], string | null, string | null, Set<number>] {
  if (!checkKeys(info, "info", INFO_REQUIRED, INFO_OPTIONAL, rep)) return [[], null, null, new Set()];

  let source: string | null = info["source-language"] as string;
  if (typeof source !== "string" || !LANG_RE.test(source || "")) {
    rep.error("info.source-language", "lang-code", { value: repr(source) });
    source = null;
  }

  const others = info["other-languages"];
  const langs: string[] = source ? [source] : [];
  if (!Array.isArray(others)) {
    rep.error("info.other-languages", "other-languages-list");
  } else {
    for (const lang of others) {
      if (typeof lang !== "string" || !LANG_RE.test(lang))
        rep.error("info.other-languages", "lang-code", { value: repr(lang) });
      else if (lang === source)
        rep.error("info.other-languages", "lang-is-source", { lang });
      else if (langs.includes(lang)) rep.error("info.other-languages", "lang-repeated", { lang });
      else langs.push(lang);
    }
  }

  const cid = info["course-id"];
  if (typeof cid !== "string" || !UUID_RE.test(cid || "")) rep.error("info.course-id", "uuid", { value: repr(cid) });

  if (has(info, "title")) checkLocalized(info.title, "info.title", rep, langs, langs, "title");
  if (has(info, "description")) checkLocalized(info.description, "info.description", rep, langs, langs, "description");

  const author = info.author;
  if (typeof author !== "string" || blank(author)) rep.error("info.author", "non-empty-string");

  const version = info.version;
  if (typeof version !== "string" || !VERSION_RE.test(version || ""))
    rep.error("info.version", "version", { value: repr(version) });

  const date = info.date;
  if (typeof date !== "string" || !DATE_RE.test(date || "")) {
    rep.error("info.date", "date-format", { value: repr(date) });
  } else if (!realDate(date)) {
    rep.error("info.date", "date-real", { value: repr(date) });
  }

  let start: string | null = info.start as string;
  if (typeof start !== "string" || !ID_RE.test(start || "")) {
    rep.error("info.start", "start-id", { value: repr(start) });
    start = null;
  }

  const numbers = new Set<number>();
  const sections = info.sections;
  if (sections !== undefined && sections !== null) {
    if (!Array.isArray(sections)) {
      rep.error("info.sections", "list");
    } else {
      sections.forEach((sec, i) => {
        const spot = `info.sections[${i}]`;
        if (!checkKeys(sec, spot, ["number", "title"], [], rep)) return;
        const num = sec.number;
        if (!wholeNumber(num) || num < 1) rep.error(spot, "section-number", { value: repr(num) });
        else if (numbers.has(num)) rep.error(spot, "section-twice", { number: num });
        else numbers.add(num);
        checkLocalized(sec.title, `${spot}.title`, rep, langs, langs, "section title");
      });
    }
  }

  const sp = info["system-prompt"];
  if (sp !== undefined && sp !== null) {
    if (typeof sp !== "string" || blank(sp)) rep.error("info.system-prompt", "non-empty-string");
    else if (!sp.toLowerCase().includes("language"))
      rep.warn("info.system-prompt", "system-prompt-language");
  }

  return [langs, source, start, numbers];
}

function realDate(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}

function validateQuiz(content: Dict, where: string, rep: Report, langs: string[]): string[] {
  const items = content.items;
  if (!Array.isArray(items) || items.length === 0) {
    rep.error(`${where}.items`, "quiz-empty");
    return [];
  }
  const produced: string[] = [];
  const qkeys = new Set<string>();
  items.forEach((q, i) => {
    const spot = `${where}.items[${i}]`;
    if (!checkKeys(q, spot, ["question", "options"], ["key", "feedback"], rep)) return;
    const key = q.key;
    if (key !== undefined && key !== null) {
      if (typeof key !== "string" || !NAME_RE.test(key))
        rep.error(spot, "key-name", { value: repr(key) });
      else if (["score", "total", "percent"].includes(key))
        rep.error(spot, "quiz-key-reserved", { key });
      else if (qkeys.has(key)) rep.error(spot, "quiz-key-twice", { key });
      else {
        qkeys.add(key);
        produced.push(key);
      }
    }
    checkLocalized(q.question, `${spot}.question`, rep, langs, langs, "question");
    if (has(q, "feedback")) checkLocalized(q.feedback, `${spot}.feedback`, rep, langs, langs, "feedback");

    const options = q.options;
    if (!Array.isArray(options) || options.length < 2) {
      rep.error(`${spot}.options`, "question-options");
      return;
    }
    let correct = 0;
    let correctAt: number | null = null;
    const values = new Set<string>();
    options.forEach((opt, j) => {
      const ospot = `${spot}.options[${j}]`;
      if (!checkKeys(opt, ospot, ["value", "label", "correct"], [], rep)) return;
      const value = opt.value;
      if (typeof value !== "string" || !NAME_RE.test(value))
        rep.error(ospot, "value-name", { value: repr(value) });
      else if (values.has(value)) rep.error(ospot, "question-value-twice", { value });
      else values.add(value);
      checkLocalized(opt.label, `${ospot}.label`, rep, langs, langs, "option label");
      if (opt.correct === true) {
        correct += 1;
        if (correctAt === null) correctAt = j;
      } else if (typeof opt.correct !== "boolean") rep.error(ospot, "correct-bool");
    });
    if (correct !== 1) rep.error(`${spot}.options`, "one-correct", { count: correct });
    else if (correctAt !== null) rep.correctSlots.push([where, correctAt, options.length]);
  });
  checkAnswerSpread(
    rep.correctSlots.filter((s) => s[0] === where),
    where,
    rep,
    "this quiz",
  );
  return produced;
}

function checkAnswerSpread(slots: Slot[], where: string, rep: Report, scope: string) {
  if (slots.length < 3) return;
  const counts = new Map<number, number>();
  for (const [, idx] of slots) counts.set(idx, (counts.get(idx) ?? 0) + 1);
  let top = -1;
  let hits = -1;
  for (const [idx, count] of counts) if (count > hits) [top, hits] = [idx, count];
  const letter = String.fromCharCode(65 + top);
  if (hits === slots.length)
    rep.warn(where, "spread-all", { letter, scope });
  else if (hits / slots.length > 0.6)
    rep.warn(where, "spread-most", { letter, hits, total: slots.length, scope });
}

function validateForm(content: Dict, where: string, rep: Report, langs: string[]): string[] {
  if (has(content, "instructions"))
    checkLocalized(content.instructions, `${where}.instructions`, rep, langs, langs, "instructions");

  const items = content.items;
  if (!Array.isArray(items) || items.length === 0) {
    rep.error(`${where}.items`, "form-empty");
    return [];
  }

  if (items.length === 1 && isDict(items[0]) && items[0].type === "text-area" && !has(content, "instructions"))
    rep.warn(where, "form-assignment");

  const produced: string[] = [];
  const keys = new Set<string>();
  items.forEach((field, i) => {
    const spot = `${where}.items[${i}]`;
    if (!checkKeys(field, spot, ["key", "type", "label"], ["required", "options", "min-words", "max-words"], rep))
      return;
    const key = field.key;
    if (typeof key !== "string" || !NAME_RE.test(key))
      rep.error(spot, "key-name", { value: repr(key) });
    else if (keys.has(key)) rep.error(spot, "form-key-twice", { key });
    else {
      keys.add(key);
      produced.push(key);
    }
    let ftype = field.type as string | null;
    if (!FIELD_TYPES.has(ftype as string)) {
      rep.error(spot, "field-type", { value: repr(ftype), allowed: repr(sorted(FIELD_TYPES)) });
      ftype = null;
    }
    checkLocalized(field.label, `${spot}.label`, rep, langs, langs, "field label");
    if (has(field, "required") && typeof field.required !== "boolean") rep.error(spot, "required-bool");

    const limits: Record<string, number> = {};
    for (const bound of ["min-words", "max-words"]) {
      if (!has(field, bound)) continue;
      const v = field[bound];
      if (ftype !== null && ftype !== "text-line" && ftype !== "text-area")
        rep.error(spot, "words-not-counted", { type: ftype, bound });
      else if (!wholeNumber(v) || v < 1) rep.error(spot, "words-whole", { bound, value: repr(v) });
      else limits[bound] = v;
    }
    if (Object.keys(limits).length === 2 && limits["max-words"] < limits["min-words"])
      rep.error(spot, "words-crossed", { max: limits["max-words"], min: limits["min-words"] });

    const options = field.options;
    if (ftype !== null && CHOICE_TYPES.has(ftype)) {
      if (!Array.isArray(options) || options.length < 2) {
        rep.error(`${spot}.options`, "field-options", { type: ftype });
      } else {
        const values = new Set<string>();
        options.forEach((opt, j) => {
          const ospot = `${spot}.options[${j}]`;
          if (!checkKeys(opt, ospot, ["value", "label"], [], rep)) return;
          const value = opt.value;
          if (typeof value !== "string" || !NAME_RE.test(value)) rep.error(ospot, "value-invalid", { value: repr(value) });
          else if (values.has(value)) rep.error(ospot, "field-value-twice", { value });
          else values.add(value);
          checkLocalized(opt.label, `${ospot}.label`, rep, langs, langs, "option label");
        });
      }
    } else if (ftype !== null && options !== undefined && options !== null) {
      rep.error(`${spot}.options`, "field-no-options", { type: ftype });
    }
  });
  return produced;
}

function validatePoints(points: unknown, criteria: unknown, spot: string, rep: Report) {
  if (!Array.isArray(points)) {
    rep.error(`${spot}.points`, "points-list");
    return;
  }
  for (let i = 0; i < points.length; i++) {
    const value = points[i];
    if (typeof value !== "number") {
      rep.error(`${spot}.points[${i}]`, "number", { value: repr(value) });
      return;
    }
    if (value < 0) {
      rep.error(`${spot}.points[${i}]`, "non-negative", { value: repr(value) });
      return;
    }
  }
  if (Array.isArray(criteria) && points.length !== criteria.length) {
    rep.error(`${spot}.points`, "points-count", { points: points.length, levels: criteria.length });
    return;
  }
  if (points.some((b, i) => i > 0 && b < points[i - 1]))
    rep.warn(`${spot}.points`, "points-order", { points: points.map(str).join(", ") });
}

function validateJudgeCriteria(criteria: unknown, ntype: string, spot: string, rep: Report) {
  if (ntype === "choice") {
    if (!isDict(criteria)) {
      rep.error(`${spot}.criteria`, "choice-criteria");
      return;
    }
    const names = Object.keys(criteria);
    if (names.length < 2) rep.error(`${spot}.criteria`, "choice-few");
    if (names.length > 255) rep.error(`${spot}.criteria`, "choice-many", { count: names.length });
    for (const name of names) {
      const what = criteria[name];
      if (!NAME_RE.test(name))
        rep.error(`${spot}.criteria`, "choice-option-name", { name });
      if (what !== null && typeof what !== "string")
        rep.error(`${spot}.criteria.${name}`, "choice-option-text");
    }
    return;
  }

  if (ntype === "score") {
    if (!Array.isArray(criteria)) {
      rep.error(`${spot}.criteria`, "score-criteria");
      return;
    }
    if (!(criteria.length >= 2 && criteria.length <= 10))
      rep.error(`${spot}.criteria`, "score-levels", { count: criteria.length });
    criteria.forEach((level, i) => {
      if (typeof level !== "string" || blank(level)) rep.error(`${spot}.criteria[${i}]`, "score-level-text");
    });
    return;
  }

  if (criteria === undefined || criteria === null) return;
  if (!isDict(criteria)) {
    rep.error(`${spot}.criteria`, "noul-criteria");
    return;
  }
  for (const [name, what] of Object.entries(criteria)) {
    if (name !== "true" && name !== "false")
      rep.error(`${spot}.criteria`, "noul-criteria-field", { name });
    else if (typeof what !== "string" || blank(what)) rep.error(`${spot}.criteria.${name}`, "non-empty-text");
  }
}

function validateJudge(
  content: Dict,
  ntype: string,
  where: string,
  rep: Report,
): [string[], string[], Map<string, number>] {
  const produced: string[] = [];
  const prompts: string[] = [];
  const levels = new Map<string, number>();

  const state = content.state;
  if (!isDict(state) || Object.keys(state).length === 0) {
    rep.error(`${where}.content.state`, "state-object");
  } else {
    for (const [name, value] of Object.entries(state)) {
      const spot = `${where}.content.state.${name}`;
      if (!NAME_RE.test(name)) rep.error(spot, "state-field-name");
      if (typeof value === "string") prompts.push(value);
      else if (Array.isArray(value)) {
        value.forEach((entry, j) => {
          if (typeof entry !== "string") rep.error(`${spot}[${j}]`, "text");
          else prompts.push(entry);
        });
      } else rep.error(spot, "text-or-list");
    }
    if (!prompts.some((text) => STORAGE_RE().test(text)))
      rep.warn(where, "state-no-storage");
  }

  const items = content.items;
  if (!Array.isArray(items) || items.length === 0) {
    rep.error(`${where}.content.items`, "judge-empty");
    return [produced, prompts, levels];
  }

  const seen = new Set<string>();
  let scored = false;
  items.forEach((item, index) => {
    const spot = `${where}.content.items[${index}]`;
    const required = ntype === "noul" ? ["key", "instructions"] : ["key", "instructions", "criteria"];
    let optional = ntype === "noul" ? ["criteria"] : [];
    if (ntype === "score") optional = [...optional, "points"];
    if (!checkKeys(item, spot, required, optional, rep)) return;

    const key = item.key;
    if (typeof key !== "string" || !NAME_RE.test(key)) {
      rep.error(`${spot}.key`, "judge-key");
      return;
    }
    const hit = JUDGE_SUFFIXES.find((suffix) => key.endsWith(suffix));
    if (hit) {
      rep.error(`${spot}.key`, "judge-key-suffix", { suffix: hit });
      return;
    }
    if (JUDGE_RESERVED.includes(key)) {
      rep.error(`${spot}.key`, "judge-key-reserved", { key });
      return;
    }
    if (seen.has(key)) {
      rep.error(`${spot}.key`, "judge-key-twice", { key });
      return;
    }
    seen.add(key);

    const instructions = item.instructions;
    if (typeof instructions !== "string" || blank(instructions))
      rep.error(`${spot}.instructions`, "judge-instructions");
    else prompts.push(instructions);

    const criteria = item.criteria;
    validateJudgeCriteria(criteria, ntype, spot, rep);

    produced.push(key);
    if (ntype !== "noul") produced.push(`${key}-confidence`);
    if (ntype === "score") {
      if (Array.isArray(criteria)) levels.set(key, criteria.length);
      if (has(item, "points")) {
        validatePoints(item.points, criteria, spot, rep);
        produced.push(`${key}-points`);
        scored = true;
      }
    }
  });

  if (scored) produced.push("total", "percent");
  return [produced, prompts, levels];
}

function validateNode(
  node: unknown,
  index: number,
  rep: Report,
  langs: string[],
  sectionNumbers: Set<number>,
  ids: Map<string, Dict>,
): [string | null, string[], string[], Map<string, number>] {
  let where = `nodes[${index}]`;
  const none: [null, string[], string[], Map<string, number>] = [null, [], [], new Map()];
  if (!isDict(node)) {
    rep.error(where, "node-object");
    return none;
  }

  const ntype = node.type as string;
  const nid = node.id as string;
  where = typeof nid === "string" ? `node ${nid}` : where;

  if (!checkKeys(node, where, NODE_REQUIRED, NODE_OPTIONAL, rep)) return none;

  if (!NODE_TYPES.has(ntype)) {
    rep.error(where, "node-type", { value: repr(ntype), allowed: repr(sorted(NODE_TYPES)) });
    return none;
  }

  if (typeof nid !== "string" || !ID_RE.test(nid)) {
    rep.error(where, "node-id", { value: repr(nid) });
    return none;
  }
  if (ids.has(nid)) rep.error(where, "node-id-twice");
  const prefix = PREFIX[ntype];
  if (!new RegExp(`^${prefix}[0-9]+$`).test(nid))
    rep.error(where, "node-prefix", { type: ntype, prefix });

  const section = has(node, "section") ? node.section : 1;
  if (!wholeNumber(section) || section < 1) rep.error(where, "node-section", { value: repr(section) });
  else if (sectionNumbers.size && !sectionNumbers.has(section))
    rep.warn(where, "section-undeclared", { number: section });

  checkLocalized(node.title, `${where}.title`, rep, langs, langs, "title");

  const content = node.content;
  const [required, optional] = CONTENT_FIELDS[ntype];
  if (!checkKeys(content, `${where}.content`, required, optional, rep)) return [nid, [], [], new Map()];

  let produced: string[] = [];
  let prompts: string[] = [];
  let levels = new Map<string, number>();

  if (ntype === "static-md" || ntype === "static-html") {
    checkLocalized(content.item, `${where}.content.item`, rep, langs, langs, "content");
    for (const text of localizedTexts(content.item)) {
      const count = words(String(text ?? "")).length;
      if (count < 40) {
        rep.warn(where, "content-short", { count });
        break;
      }
    }
  } else if (ntype === "dynamic-md" || ntype === "dynamic-html") {
    checkLocalized(content.prompt, `${where}.content.prompt`, rep, null, null, "prompt");
    prompts = localizedTexts(content.prompt);
    let sourceJudge = content.from as string | null | undefined;
    if (sourceJudge !== undefined && sourceJudge !== null && (typeof sourceJudge !== "string" || !/^(c|s|n)[0-9]+$/.test(sourceJudge))) {
      rep.error(`${where}.content.from`, "from-id", { value: repr(sourceJudge) });
      sourceJudge = null;
    }
    if (sourceJudge) {
      for (const text of prompts) {
        const found = JUDGING_RE.exec(text);
        if (found) {
          const hit = found[0];
          rep.warn(where, "from-judging", { judge: sourceJudge, word: hit });
          break;
        }
      }
    } else if (prompts.length && !prompts.some((p) => STORAGE_RE().test(p))) {
      rep.warn(where, "dynamic-static");
    }
    produced = ["text"];
  } else if (ntype === "quiz") {
    produced = ["score", "total", "percent", ...validateQuiz(content, `${where}.content`, rep, langs)];
  } else if (ntype === "form") {
    produced = validateForm(content, `${where}.content`, rep, langs);
  } else if (ntype === "bool") {
    checkLocalized(content.question, `${where}.content.question`, rep, langs, langs, "question");
    for (const label of ["yes-label", "no-label"])
      if (has(content, label)) checkLocalized(content[label], `${where}.content.${label}`, rep, langs, langs, label);
    if (has(content, "default") && typeof content.default !== "boolean")
      rep.error(`${where}.content.default`, "true-false");
    produced = ["answer"];
  } else if (JUDGE_TYPES.includes(ntype)) {
    [produced, prompts, levels] = validateJudge(content, ntype, where, rep);
  }

  return [nid, produced.map((name) => `${nid}.${name}`), prompts, levels];
}

function collectConditionKeys(cond: unknown, where: string, rep: Report, edge: number, depth = 0): [string, unknown][] {
  if (depth > 8) {
    rep.error(where, "condition-deep", {}, edge);
    return [];
  }
  if (!isDict(cond)) {
    rep.error(where, "when-object", {}, edge);
    return [];
  }
  if (has(cond, "and") || has(cond, "or")) {
    const joiner = has(cond, "and") ? "and" : "or";
    const extra = Object.keys(cond).filter((k) => k !== joiner);
    if (extra.length) rep.error(where, "group-only", { joiner, fields: repr(sorted(extra)) }, edge);
    const group = cond[joiner];
    if (!Array.isArray(group) || group.length < 2) {
      rep.error(`${where}.${joiner}`, "group-list", {}, edge);
      return [];
    }
    return group.flatMap((sub, i) => collectConditionKeys(sub, `${where}.${joiner}[${i}]`, rep, edge, depth + 1));
  }

  const extra = Object.keys(cond).filter((k) => !["key", "operator", "value"].includes(k));
  if (extra.length) rep.error(where, "condition-unknown", { fields: repr(sorted(extra)) }, edge);
  for (const field of ["key", "operator", "value"]) {
    if (!has(cond, field)) {
      rep.error(where, "condition-missing", { field }, edge);
      return [];
    }
  }
  const key = cond.key;
  if (typeof key !== "string" || !KEY_RE.test(key)) {
    rep.error(where, "condition-key", { value: repr(key) }, edge);
    return [];
  }
  if (!OPERATORS.has(cond.operator as string))
    rep.error(where, "condition-operator", { value: repr(cond.operator), allowed: repr(sorted(OPERATORS)) }, edge);
  if (!["string", "number", "boolean"].includes(typeof cond.value))
    rep.error(where, "condition-value", {}, edge);
  return [[key, cond.value]];
}

/** The whole of validate_course.py's main(), minus the printing. */
export function validateRules(course: unknown): RulesResult {
  const rep = new Report();
  const doc: Dict = isDict(course) ? course : {};

  checkKeys(doc, "course", ["info", "nodes", "edges"], ["$schema"], rep);
  if (has(doc, "$schema") && typeof doc.$schema !== "string")
    rep.error("$schema", "schema-string");

  const [langs, , start, sectionNumbers] = validateInfo(has(doc, "info") ? doc.info : {}, rep);

  let nodes = doc.nodes as unknown[];
  if (!Array.isArray(nodes) || nodes.length === 0) {
    rep.error("nodes", "non-empty-list");
    nodes = [];
  }

  const ids = new Map<string, Dict>();
  const order: string[] = [];
  const produced = new Map<string, string>();
  const promptsByNode = new Map<string, string[]>();
  const types = new Map<string, string>();
  const scoreLevels = new Map<string, Map<string, number>>();
  const writesFrom = new Map<string, string>();
  nodes.forEach((node, i) => {
    const [nid, keys, prompts, levels] = validateNode(node, i, rep, langs, sectionNumbers, ids);
    if (nid === null) return;
    const n = node as Dict;
    if (!ids.has(nid)) order.push(nid);
    ids.set(nid, n);
    types.set(nid, n.type as string);
    for (const key of keys) produced.set(key, nid);
    promptsByNode.set(nid, prompts);
    if (levels.size) scoreLevels.set(nid, levels);
    if (n.type === "dynamic-md" || n.type === "dynamic-html") {
      const origin = isDict(n.content) ? n.content.from : undefined;
      if (typeof origin === "string") writesFrom.set(nid, origin);
    }
  });

  const gradedKeys = new Set(
    [...produced.entries()]
      .filter(([key, owner]) => JUDGE_TYPES.includes(types.get(owner)!) || (types.get(owner) === "quiz" && key.endsWith(".percent")))
      .map(([key]) => key),
  );
  for (const nid of order) {
    if (!JUDGE_TYPES.includes(types.get(nid)!)) continue;
    const content = ids.get(nid)!.content;
    const state = isDict(content) ? content.state : undefined;
    if (!isDict(state)) continue;
    for (const [name, value] of Object.entries(state)) {
      const text =
        typeof value === "string"
          ? value
          : Array.isArray(value)
            ? value.filter((e) => typeof e === "string").join(" ")
            : "";
      for (const m of text.matchAll(STORAGE_RE())) {
        const key = m[1].trim();
        if (gradedKeys.has(key) && produced.get(key) !== nid)
          rep.warn(`node ${nid}`, "state-reads-mark", { name, key });
      }
    }
  }

  for (const [nid, origin] of writesFrom) {
    if (!ids.has(origin)) rep.error(`node ${nid}`, "from-missing", { from: origin });
    else if (!JUDGE_TYPES.includes(types.get(origin)!))
      rep.error(`node ${nid}`, "from-not-judge", { from: origin, type: String(types.get(origin)) });
  }

  let edges = doc.edges as unknown[];
  if (!Array.isArray(edges)) {
    rep.error("edges", "list");
    edges = [];
  }

  type Out = { edge: Dict; index: number };
  const outgoing = new Map<string, Out[]>([...ids.keys()].map((nid) => [nid, []]));
  const reads: [string, string, string, unknown, number][] = [];
  edges.forEach((edge, i) => {
    let where = `edges[${i}]`;
    if (!checkKeys(edge, where, ["from", "to"], ["when"], rep)) return;
    const src = edge.from as string;
    const dst = edge.to as string;
    where = `edge ${str(src)} -> ${str(dst)}`;
    let ok = true;
    if (!ids.has(src)) {
      rep.error(where, "edge-from", { value: repr(src) }, i);
      ok = false;
    }
    if (!ids.has(dst)) {
      rep.error(where, "edge-to", { value: repr(dst) }, i);
      ok = false;
    }
    if (!ok) return;
    outgoing.get(src)!.push({ edge, index: i });
    if (has(edge, "when"))
      for (const [key, value] of collectConditionKeys(edge.when, `${where}.when`, rep, i)) reads.push([src, key, where, value, i]);
  });

  for (const [nid, out] of outgoing) {
    const plain = out.map((e, i) => (has(e.edge, "when") ? -1 : i)).filter((i) => i !== -1);
    if (!plain.length && out.length) {
      if (JUDGE_TYPES.includes(types.get(nid)!))
        rep.error(`node ${nid}`, "judge-no-fallback");
      else
        rep.warn(`node ${nid}`, "no-fallback");
    }
    if (plain.length > 1) rep.warn(`node ${nid}`, "fallbacks", { count: plain.length });
    if (plain.length && plain[0] < out.length - 1) {
      const dead = out.length - 1 - plain[0];
      rep.error(`node ${nid}`, "fallback-not-last", { count: dead });
    }
    if (JUDGE_TYPES.includes(types.get(nid)!)) {
      for (const i of plain) {
        const target = out[i].edge.to as string;
        if (writesFrom.get(target) === nid)
          rep.error(`node ${nid}`, "fallback-to-feedback", { target });
      }
    }
  }

  const reachable = new Set<string>();
  const ancestors = new Map<string, Set<string>>();
  const next = (nid: string) => (outgoing.get(nid) ?? []).map((o) => o.edge.to as string);
  if (start && ids.has(start)) {
    const queue = [start];
    reachable.add(start);
    while (queue.length) {
      const nid = queue.shift()!;
      for (const to of next(nid))
        if (!reachable.has(to)) {
          reachable.add(to);
          queue.push(to);
        }
    }
    for (const nid of ids.keys()) {
      const seen = new Set<string>();
      const queue = [nid];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const to of next(cur))
          if (!seen.has(to)) {
            seen.add(to);
            queue.push(to);
          }
      }
      for (const target of seen) {
        if (!ancestors.has(target)) ancestors.set(target, new Set());
        ancestors.get(target)!.add(nid);
      }
    }
    const stranded = order.filter((nid) => !reachable.has(nid));
    if (stranded.length)
      rep.error("graph", "unreachable", { nodes: stranded.join(", ") });
  } else if (start) {
    rep.error("info.start", "start-missing", { start });
  }

  const terminals = order.filter((nid) => reachable.has(nid) && !(outgoing.get(nid) ?? []).length);
  if (terminals.length > 1)
    rep.warn("graph", "endings", { nodes: terminals.join(", ") });

  const upstreamOf = (producer: string, reader: string) =>
    producer === reader || (ancestors.get(reader)?.has(producer) ?? false);

  const reachesWithout = (target: string, blocked: string): boolean => {
    if (!start || start === target || start === blocked) return start === target;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const nxt of next(queue.shift()!)) {
        if (nxt === blocked || seen.has(nxt)) continue;
        if (nxt === target) return true;
        seen.add(nxt);
        queue.push(nxt);
      }
    }
    return false;
  };

  for (const [nid, origin] of writesFrom)
    if (ids.has(nid) && ids.has(origin) && reachable.has(nid) && reachesWithout(nid, origin))
      rep.error(`node ${nid}`, "from-bypassed", { judge: origin });

  for (const [reader, key, where, value, edge] of reads) {
    if (!produced.has(key)) {
      rep.error(where, "key-unproduced", { key }, edge);
      continue;
    }
    if (ancestors.size && !upstreamOf(produced.get(key)!, reader))
      rep.warn(where, "key-not-upstream", { key, producer: produced.get(key)!, reader }, edge);
    const dot = key.indexOf(".");
    const owner = key.slice(0, dot);
    const name = key.slice(dot + 1);
    const count = scoreLevels.get(owner)?.get(name);
    if (count && typeof value === "number" && value > count - 1)
      rep.warn(where, "key-levels", { key, top: count - 1, value: str(value), owner }, edge);
  }

  for (const [nid, prompts] of promptsByNode) {
    for (const prompt of prompts) {
      for (const m of String(prompt ?? "").matchAll(STORAGE_RE())) {
        const key = m[1].trim();
        const where = `node ${nid} prompt`;
        if (!KEY_RE.test(key)) rep.error(where, "storage-invalid", { key });
        else if (!produced.has(key)) rep.error(where, "storage-unproduced", { key });
        else if (ancestors.size && !upstreamOf(produced.get(key)!, nid))
          rep.warn(where, "storage-not-upstream", { key, producer: produced.get(key)!, node: nid });
      }
    }
  }

  const used = new Set(reads.map((r) => r[1]));
  for (const prompts of promptsByNode.values())
    for (const prompt of prompts) for (const m of String(prompt ?? "").matchAll(STORAGE_RE())) used.add(m[1].trim());
  for (const nid of order) {
    if (["quiz", "form", "bool", ...JUDGE_TYPES].includes(types.get(nid)!)) {
      const keys = [...produced.entries()].filter(([, owner]) => owner === nid).map(([k]) => k);
      if (keys.length && !keys.some((k) => used.has(k)))
        rep.warn(`node ${nid}`, "data-unused");
    }
  }

  checkAnswerSpread(rep.correctSlots, "quizzes", rep, "the whole course");

  rep.finish();
  return {
    issues: [...rep.errors, ...rep.warnings],
    produced,
    scoreLevels,
    order,
    langs,
    reachable,
  };
}

/** The lines validate_course.py --quiet prints for the same course. */
export const asScriptLines = (issues: Issue[]): string[] =>
  issues
    .filter((i) => i.source === "rules")
    .map((i) => `${i.level === "error" ? "ERROR  " : "WARNING"} ${i.where}: ${i.message}`);
