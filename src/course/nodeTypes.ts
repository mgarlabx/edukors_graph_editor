import type { CourseNode, JudgeType, Loc, NodeType } from "../schema/types";

export const SCHEMA_URL = "https://edukors.org/graph/schema/v1/";

export const NODE_TYPES: NodeType[] = [
  "static-md",
  "static-html",
  "dynamic-md",
  "dynamic-html",
  "quiz",
  "form",
  "bool",
  "choice",
  "score",
  "noul",
];

export const PREFIX: Record<NodeType, string> = {
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

export const TYPE_OF_PREFIX: Record<string, NodeType> = Object.fromEntries(
  Object.entries(PREFIX).map(([type, prefix]) => [prefix, type as NodeType]),
);

export const JUDGE_TYPES: JudgeType[] = ["choice", "score", "noul"];
export const DYNAMIC_TYPES: NodeType[] = ["dynamic-md", "dynamic-html"];

export const isJudge = (type: string | undefined): type is JudgeType =>
  JUDGE_TYPES.includes(type as JudgeType);

export const isDynamic = (type: string | undefined): boolean =>
  DYNAMIC_TYPES.includes(type as NodeType);

/** Colour and glyph per type: the canvas, the palette and the problems list share them. */
export const TYPE_STYLE: Record<NodeType, { color: string; icon: string }> = {
  "static-md": { color: "#4f7cff", icon: "¶" },
  "static-html": { color: "#2b9bd6", icon: "</>" },
  "dynamic-md": { color: "#9b5de5", icon: "✦" },
  "dynamic-html": { color: "#c05ce0", icon: "✦</>" },
  quiz: { color: "#f08c00", icon: "?" },
  form: { color: "#e8590c", icon: "✎" },
  bool: { color: "#d6336c", icon: "⇋" },
  choice: { color: "#0ca678", icon: "◇" },
  score: { color: "#2f9e44", icon: "▤" },
  noul: { color: "#1098ad", icon: "%" },
};

/** The id with the next free number for a prefix: sm1, sm2… */
export const nextId = (type: NodeType, taken: Iterable<string>): string => {
  const prefix = PREFIX[type];
  const used = new Set<number>();
  const pattern = new RegExp(`^${prefix}([0-9]+)$`);
  for (const id of taken) {
    const m = pattern.exec(id);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${prefix}${n}`;
};

export const emptyLoc = (langs: string[]): Loc => langs.map((lang) => ({ lang, text: "" }));

const loc = (langs: string[], text: string): Loc =>
  langs.map((lang, i) => ({ lang, text: i === 0 ? text : "" }));

/**
 * A new node of a type, with the least content that makes it a node of that
 * type. Texts are written in the source language and left empty in the others.
 */
export const newNode = (type: NodeType, id: string, langs: string[]): CourseNode => {
  const base = { id, type, title: loc(langs, "") } as CourseNode;
  switch (type) {
    case "static-md":
    case "static-html":
      return { ...base, content: { item: emptyLoc(langs) } };
    case "dynamic-md":
    case "dynamic-html":
      return { ...base, content: { prompt: [{ lang: langs[0], text: "" }] } };
    case "quiz":
      return {
        ...base,
        content: {
          items: [
            {
              question: emptyLoc(langs),
              options: [
                { value: "a", label: emptyLoc(langs), correct: true },
                { value: "b", label: emptyLoc(langs), correct: false },
              ],
            },
          ],
        },
      };
    case "form":
      return {
        ...base,
        content: { items: [{ key: "text", type: "text-area", label: emptyLoc(langs), required: true }] },
      };
    case "bool":
      return { ...base, content: { question: emptyLoc(langs) } };
    case "choice":
      return {
        ...base,
        content: {
          state: { answer: "" },
          items: [{ key: "track", instructions: "", criteria: { first: "", second: "", unclear: "" } }],
        },
      };
    case "score":
      return {
        ...base,
        content: {
          state: { task: "", answer: "" },
          items: [{ key: "quality", instructions: "", criteria: ["", "", ""] }],
        },
      };
    case "noul":
      return { ...base, content: { state: { answer: "" }, items: [{ key: "ready", instructions: "" }] } };
  }
};
