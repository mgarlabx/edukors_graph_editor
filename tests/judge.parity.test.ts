/**
 * The preview's AI half against the server's (plan 5.5, "Paridade com o
 * servidor"): the same answers from the model must produce the same keys, the
 * same refusals, the same prompts and the same path -- in the editor's port,
 * in ai.php / course.php, and in the player's own Course class.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGeneration,
  judgeBody,
  judgementBlock,
  judgeModel,
  judgeState,
  judgeVars,
  readAnswers,
  sameModel,
  NotJudged,
  type Vars,
} from "../src/judge/pipeline";
import { chooseEdge } from "../src/course/condition";
import { hasPhp, hasReference, loadSample, PLAYER_SRC, SAMPLES } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type C = any;

const php = (input: Record<string, unknown>): C =>
  JSON.parse(execFileSync("php", [join(__dirname, "php/harness.php"), PLAYER_SRC], { input: JSON.stringify(input), encoding: "utf8" }));

const tsJudge = (nodeId: string, type: string, content: C, answers: unknown, floor: number) => {
  try {
    return { judged: true, vars: judgeVars(nodeId, type, content, readAnswers(answers, type, content.items), floor), reason: null };
  } catch (e) {
    if (!(e instanceof NotJudged)) throw e;
    return { judged: false, vars: {}, reason: e.message };
  }
};

const full = loadSample(SAMPLES[2].path);
const s1 = full.nodes.find((n: C) => n.id === "s1");

const choice = {
  id: "c1",
  type: "choice",
  content: {
    state: { answer: "{{STORAGE: f1.text}}", task: "Write" },
    items: [
      { key: "track", instructions: "Which track?", criteria: { remedial: "a", standard: null, advanced: "c", unclear: "d" } },
      { key: "tone", instructions: "Which tone?", criteria: { warm: null, cold: null } },
    ],
  },
};
const noul = {
  id: "n1",
  type: "noul",
  content: { state: { answer: "{{STORAGE: f1.text}}" }, items: [{ key: "ready", instructions: "Ready?" }, { key: "clear", instructions: "Clear?" }] },
};

const scoreAnswer = (score: number, conf = 0.9, spread?: number[]) => {
  const levels = 5;
  const p = spread ?? Array.from({ length: levels }, (_, i) => (i === Math.floor(score) ? 1 - (score % 1) : i === Math.floor(score) + 1 ? score % 1 : 0));
  return { score, confidence: conf, probabilities: p };
};
const allScores = (f: (key: string, i: number) => unknown) =>
  Object.fromEntries(s1.content.items.map((it: C, i: number) => [it.key, f(it.key, i)]));

const CASES: [string, C, unknown, number][] = [
  ["score clean", s1, allScores((_, i) => scoreAnswer([0, 1.43, 2.5, 3.99, 4][i])), 0.7],
  ["score spread as a map", s1, allScores(() => ({ score: 2.2, confidence: "0.95", probabilities: { "0": 0, "1": 0, "2": 0.8, "3": 0.2, "4": 0 } })), 0.7],
  ["score rounding slack", s1, allScores(() => scoreAnswer(1.5, 0.8, [0.0, 0.505, 0.505, 0, 0])), 0.7],
  ["score sum off", s1, allScores(() => scoreAnswer(1, 0.8, [0.5, 0.6, 0, 0, 0])), 0.7],
  ["score off the scale", s1, allScores(() => scoreAnswer(4.2)), 0.7],
  ["score under the floor", s1, allScores((_, i) => scoreAnswer(2, i === 3 ? 0.6994 : 0.9)), 0.7],
  ["score floor rounds up", s1, allScores(() => scoreAnswer(2, 0.6996)), 0.7],
  ["score missing one", s1, { [s1.content.items[0].key]: scoreAnswer(1) }, 0.7],
  ["score without confidence", s1, allScores(() => ({ score: 1, probabilities: [0, 1, 0, 0, 0] })), 0.7],
  ["score stray label with weight", s1, allScores(() => ({ score: 1, confidence: 1, probabilities: { "0": 0, "1": 0.9, "2": 0, "3": 0, "4": 0, "9": 0.1 } })), 0],
  ["score stray zero", s1, allScores(() => ({ score: 1, confidence: 1, probabilities: { "0": 0, "1": 1, "2": 0, "3": 0, "4": 0, x: 0 } })), 0],
  ["score probability over 1", s1, allScores(() => ({ score: 1, confidence: 1, probabilities: [0, 1.2, 0, 0, 0] })), 0],
  ["choice clean", choice, { track: { choice: "standard", confidence: 0.91, probabilities: { remedial: 0.05, standard: 0.91, advanced: 0.04, unclear: 0 } }, tone: { choice: " warm ", confidence: 0.75, probabilities: { warm: 0.75, cold: 0.25 } } }, 0.7],
  ["choice outside the list", choice, { track: { choice: "expert", confidence: 0.9, probabilities: { remedial: 0, standard: 1, advanced: 0, unclear: 0 } }, tone: { choice: "warm", confidence: 1, probabilities: { warm: 1, cold: 0 } } }, 0],
  ["choice nothing chosen", choice, { track: { choice: "", confidence: 0.9, probabilities: {} }, tone: {} }, 0],
  ["choice missing a label", choice, { track: { choice: "standard", confidence: 0.9, probabilities: { standard: 1 } }, tone: { choice: "warm", confidence: 1, probabilities: { warm: 1, cold: 0 } } }, 0],
  ["noul clean", noul, { ready: { noul: 0.555 }, clear: { noul: "0.1" } }, 0.99],
  ["noul out of range", noul, { ready: { noul: 1.5 }, clear: { noul: 0 } }, 0],
  ["noul no number", noul, { ready: { noul: "yes" }, clear: { noul: 0 } }, 0],
  ["nothing at all", noul, [], 0],
];

describe.skipIf(!hasReference || !hasPhp)("judge parity with ai.php", () => {
  for (const [name, node, answers, floor] of CASES) {
    it(name, () => {
      const mine = tsJudge(node.id, node.type, node.content, answers, floor);
      const theirs = php({ op: "judge", nodeId: node.id, type: node.type, content: node.content, answers, floor });
      expect(mine).toEqual(theirs);
    });
  }

  it("request body and state", () => {
    const vars = { "f2.text": "My cat\nis a lion", "f1.country": ["br", "pt"], "q1.percent": 70 };
    for (const node of [s1, choice, noul]) {
      const state = judgeState(node.content, vars);
      expect(state).toEqual(php({ op: "state", content: node.content, vars }));
      expect(judgeBody(node.type, node.content.items, state, "typesafe/jev-1.13")).toEqual(
        php({ op: "body", type: node.type, items: node.content.items, state, model: "typesafe/jev-1.13" }),
      );
    }
  });

  it("model slugs", () => {
    for (const slug of ["typesafe/jev-1.13", "openai/gpt-latest", "anthropic/claude", "x/y-preview", ""]) {
      let mine: unknown;
      try {
        mine = { slug: judgeModel(slug) };
      } catch (e) {
        mine = { error: (e as Error).message };
      }
      expect(mine).toEqual(php({ op: "model", slug }));
    }
    for (const [answered, asked] of [
      ["typesafe/jev-1.13-20260917", "typesafe/jev-1.13"],
      ["typesafe/jev-1.13", "typesafe/jev-1.13"],
      ["typesafe/jev-1.14", "typesafe/jev-1.13"],
      ["typesafe/jev-1.13-2026", "typesafe/jev-1.13"],
    ])
      expect(sameModel(answered, asked)).toBe(php({ op: "same", answered, asked }));
  });

  it("feedback prompt written from a judgement", () => {
    const judged = tsJudge("s1", "score", s1.content, allScores((_, i) => scoreAnswer([0.5, 1.43, 2, 3.25, 4][i])), 0).vars as Vars;
    const vars: Vars = { ...judged, "f2.text": "Lions live in prides.", "f1.country": ["br"], "b1.answer": true, "q1.percent": 80 };
    expect(judgementBlock(s1, vars)).toBe(php({ op: "block", judge: s1, vars }));
    for (const dm of full.nodes.filter((n: C) => n.type.startsWith("dynamic")))
      for (const lang of ["en", "pt", "zh"]) {
        const mine = buildGeneration(full, dm.id, lang, vars, { model: "m", temperature: 0.7, maxTokens: 1200 });
        expect({ system: mine.system, user: mine.user }).toEqual(php({ op: "write", course: full, nodeId: dm.id, lang, vars }));
      }
  });
});

/** The player's Course class, taken out of the player itself. */
const playerCourse = (() => {
  const html = readFileSync(join(__dirname, "..", "assets", "course_player.html"), "utf8");
  const start = html.indexOf("class Course{") >= 0 ? html.indexOf("class Course{") : html.indexOf("class Course {");
  const end = html.indexOf("class ProgressStore", start);
  return new Function(`${html.slice(start, end)}; return Course;`)();
})();

describe.skipIf(!hasReference || !hasPhp)("branching parity: editor, player and course.php", () => {
  const VAR_SETS: Vars[] = [
    {},
    { "f1.interest": "big", "q1.percent": 70, "b1.answer": true, "s1.percent": 60, "b2.answer": false },
    { "f1.interest": "small", "q1.percent": 69.9, "b1.answer": false, "s1.percent": 59 },
    { "f1.interest": "other", "q1.percent": "70", "b1.answer": "true", "s1.percent": "60.0", "b2.answer": 1 },
    { "q1.percent": 100, "b1.answer": 0, "b2.answer": "false", "s1.percent": null },
    { "q1.percent": 0, "q1.score": 5, "s1.percent": 100, "b2.answer": true },
  ];
  for (const { slug, path } of SAMPLES) {
    const course = loadSample(path);
    it(slug, () => {
      const player = new playerCourse(course);
      for (const vars of VAR_SETS)
        for (const node of course.nodes) {
          const i = chooseEdge(course.edges, node.id, vars);
          const mine = i === -1 ? null : course.edges[i].to;
          expect(mine).toBe(player.nextNodeId(node.id, vars));
          expect(mine).toBe(php({ op: "next", course, from: node.id, vars }));
        }
    });
  }
});
