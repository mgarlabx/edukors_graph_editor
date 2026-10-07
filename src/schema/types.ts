/**
 * The types the editor works with.
 *
 * The generated file follows the schema to the letter, which is right for a
 * course that is valid. The editor also has to hold a course while it is being
 * written -- an empty title, a quiz with one option, JSON typed by hand -- so
 * the shapes here are the same ones, with the content of a node left open and
 * the arrays allowed to be empty.
 */
import type {
  BoolContent,
  ChoiceContent,
  ChoiceQuestion,
  Comparison,
  DynamicMdContent,
  FormContent,
  FormField,
  FormOption,
  NodePosition,
  NodeType,
  NoulContent,
  NoulQuestion,
  QuizContent,
  QuizOption,
  QuizQuestion,
  ScoreContent,
  ScoreQuestion,
  StaticMdContent,
} from "./course.generated";

export type {
  BoolContent,
  ChoiceContent,
  ChoiceQuestion,
  Comparison,
  DynamicMdContent,
  FormContent,
  FormField,
  FormOption,
  NodePosition,
  NodeType,
  NoulContent,
  NoulQuestion,
  QuizContent,
  QuizOption,
  QuizQuestion,
  ScoreContent,
  ScoreQuestion,
  StaticMdContent,
};

export interface LocalizedText {
  lang: string;
  text: string;
}

/** A localized text list, possibly still empty while it is being written. */
export type Loc = LocalizedText[];

export type Operator = Comparison["operator"];

export type Condition =
  | { key: string; operator: Operator; value: string | number | boolean }
  | { and: Condition[] }
  | { or: Condition[] };

/** What a tool or use case keeps with the course, which the format does not define: kept as it was. */
export type Extras = Record<string, unknown>;

export interface CourseEdge {
  from: string;
  to: string;
  when?: Condition;
  extras?: Extras;
}

export interface CourseNode {
  id: string;
  type: NodeType;
  section?: number;
  position?: NodePosition;
  title: Loc;
  // The shape depends on `type`; see contentOf() in course/nodeTypes.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  extras?: Extras;
}

export interface Section {
  number: number;
  title: Loc;
}

export interface CourseInfo {
  "course-id": string;
  "source-language": string;
  "other-languages": string[];
  title: Loc;
  description?: Loc;
  author: string;
  version: string;
  date: string;
  start: string;
  sections?: Section[];
  "system-prompt"?: string;
  extras?: Extras;
}

export interface Course {
  $schema?: string;
  info: CourseInfo;
  nodes: CourseNode[];
  edges: CourseEdge[];
}

export type JudgeType = "choice" | "score" | "noul";
