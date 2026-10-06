/**
 * The editor's validator against the player's, for the samples and for courses
 * broken on purpose (plan, phase 3 criterion): the editor reports an error
 * exactly when the player's src/validate.php would refuse to import the course.
 *
 * The editor's lines were ported from validate_course.py, which the
 * edukors_graph repository no longer carries. They are kept in a snapshot,
 * taken while they still matched that script line for line, so that a change
 * in their wording is a decision rather than an accident.
 */
import { describe, expect, it } from "vitest";
import { asScriptLines, validateRules } from "../src/validate/rules";
import { clone, hasPhp, hasReference, loadSample, playerValidation, SAMPLES } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type C = any;
type Mutation = [string, (c: C) => boolean];

const node = (c: C, type: string) => c.nodes.find((n: C) => n.type === type);
const edgesFrom = (c: C, id: string) => c.edges.filter((e: C) => e.from === id);

/** Each returns false when the course has nothing it can break. */
const MUTATIONS: Mutation[] = [
  ["no author", (c) => (delete c.info.author, true)],
  ["source repeated", (c) => (c.info["other-languages"].push(c.info["source-language"]), true)],
  ["bad lang code", (c) => (c.info["other-languages"].push("Portuguese"), true)],
  ["bad uuid and version", (c) => ((c.info["course-id"] = "nope"), (c.info.version = "1.0"), true)],
  ["impossible date", (c) => ((c.info.date = "2026-02-30"), true)],
  ["start judge", (c) => (node(c, "score") ? ((c.info.start = node(c, "score").id), true) : false)],
  ["missing start", (c) => ((c.info.start = "sm99"), true)],
  ["wrong prefix", (c) => ((c.nodes[1].type = "quiz"), true)],
  ["duplicate id", (c) => ((c.nodes[2].id = c.nodes[1].id), true)],
  ["unknown field", (c) => ((c.nodes[0].colour = "red"), (c.nodes[0].content.extra = 1), true)],
  ["extras", (c) => {
    c.info.extras = { "acme-lms": { course: "MAT-07", empty: {} } };
    c.nodes[0].extras = { "acme-lms": { competency: "fractions-1" } };
    c.edges[0].extras = { analytics: { tag: "start" } };
    return true;
  }],
  ["extras not an object", (c) => ((c.nodes[0].extras = "acme"), (c.info.extras = ["a"]), true)],
  ["extras empty", (c) => ((c.edges[0].extras = {}), true)],
  ["extras in content", (c) => ((c.nodes[0].content.extras = { a: 1 }), true)],
  ["invalid type", (c) => ((c.nodes[0].type = "video"), true)],
  ["edge to nowhere", (c) => (c.edges.push({ from: c.nodes[0].id, to: "sm77" }), true)],
  ["fallback first", (c) => {
    const id = c.edges.find((e: C) => e.when)?.from;
    if (!id) return false;
    const out = edgesFrom(c, id);
    const fb = out.find((e: C) => !e.when);
    c.edges.splice(c.edges.indexOf(fb), 1);
    c.edges.splice(c.edges.indexOf(out[0]), 0, fb);
    return true;
  }],
  ["two fallbacks", (c) => (c.edges.push({ ...c.edges[0] }), true)],
  ["judge without fallback", (c) => {
    const s = node(c, "score");
    if (!s) return false;
    c.edges = c.edges.filter((e: C) => !(e.from === s.id && !e.when));
    return true;
  }],
  ["judge fallback to its feedback", (c) => {
    const dm = c.nodes.find((n: C) => n.content?.from);
    if (!dm) return false;
    const fb = edgesFrom(c, dm.content.from).find((e: C) => !e.when);
    fb.to = dm.id;
    return true;
  }],
  ["two correct", (c) => {
    const q = node(c, "quiz");
    if (!q) return false;
    q.content.items[0].options.forEach((o: C) => (o.correct = true));
    return true;
  }],
  ["no correct and bad value", (c) => {
    const q = node(c, "quiz");
    if (!q) return false;
    q.content.items[1].options.forEach((o: C) => (o.correct = false));
    q.content.items[1].options[0].value = "Bad Value";
    q.content.items[0].key = "percent";
    return true;
  }],
  ["all correct at A", (c) => {
    const q = node(c, "quiz");
    if (!q) return false;
    for (const item of q.content.items) {
      const right = item.options.find((o: C) => o.correct);
      item.options = [right, ...item.options.filter((o: C) => o !== right)];
    }
    return true;
  }],
  ["form options on text and words on radio", (c) => {
    const f = node(c, "form");
    if (!f) return false;
    f.content.items[0].options = [{ value: "a", label: [{ lang: "en", text: "A" }] }];
    f.content.items.push({ key: "pick", type: "radio", label: [{ lang: "en", text: "Pick" }], "min-words": 3 });
    return true;
  }],
  ["max below min", (c) => {
    const f = node(c, "form");
    if (!f) return false;
    Object.assign(f.content.items[0], { type: "text-area", "min-words": 50, "max-words": 10 });
    delete f.content.items[0].options;
    return true;
  }],
  ["unknown storage key", (c) => {
    const d = node(c, "dynamic-md");
    if (!d) return false;
    d.content.prompt[0].text += " {{STORAGE: f9.nothing}} {{STORAGE: bad key}}";
    return true;
  }],
  ["unknown condition key and bad operator", (c) => {
    const e = c.edges.find((x: C) => x.when?.key);
    if (!e) return false;
    e.when = { and: [{ key: "q9.percent", operator: "gte", value: 1 }, { key: e.when.key, operator: "about", value: [1] }] };
    return true;
  }],
  ["and with one", (c) => {
    const e = c.edges.find((x: C) => x.when?.key);
    if (!e) return false;
    e.when = { and: [e.when], extra: true };
    return true;
  }],
  ["points mismatch and reserved key", (c) => {
    const s = node(c, "score");
    if (!s) return false;
    s.content.items[0].points = [10, 5];
    s.content.items[1].key = "total";
    s.content.items[2].key = "diet-confidence";
    return true;
  }],
  ["points fall", (c) => {
    const s = node(c, "score");
    if (!s) return false;
    s.content.items[0].points = s.content.items[0].criteria.map((_: C, i: number) => 100 - i);
    return true;
  }],
  ["level compared to percent", (c) => {
    const s = node(c, "score");
    if (!s) return false;
    const e = edgesFrom(c, s.id).find((x: C) => x.when);
    e.when = { key: `${s.id}.${s.content.items[0].key}`, operator: "gte", value: 60 };
    return true;
  }],
  ["from a non-judge", (c) => {
    const d = node(c, "dynamic-md");
    if (!d) return false;
    d.content.from = "q1";
    return true;
  }],
  ["feedback that judges", (c) => {
    const dm = c.nodes.find((n: C) => n.content?.from);
    if (!dm) return false;
    dm.content.prompt[0].text += " Grade the essay again.";
    return true;
  }],
  ["state anchored on a grade", (c) => {
    const s = node(c, "score");
    if (!s) return false;
    s.content.state.earlier = "{{STORAGE: q1.percent}}";
    return true;
  }],
  ["undeclared section", (c) => {
    if (!c.info.sections) return false;
    c.nodes[0].section = 9;
    return true;
  }],
  ["positions", (c) => {
    c.nodes[0].position = { x: 10, y: -2.5 };
    c.nodes[1].position = { x: "10", y: true } as never;
    c.nodes[2].position = { x: 1 } as never;
    c.nodes[3].position = { x: 1, y: 2, z: 3 } as never;
    return true;
  }],
  ["missing translation and empty title", (c) => {
    if (!c.info["other-languages"].length) return false;
    c.nodes[0].title = c.nodes[0].title.slice(0, 1);
    c.nodes[1].title[0].text = " ";
    c.nodes[2].title = c.nodes[2].title.slice(1);
    return true;
  }],
  ["unreachable", (c) => {
    const target = c.nodes[c.nodes.length - 1].id;
    c.edges = c.edges.filter((e: C) => e.to !== target);
    return true;
  }],
  ["choice and noul criteria", (c) => {
    c.nodes.push(
      {
        id: "c1",
        type: "choice",
        title: c.nodes[0].title,
        content: { state: { a: "x" }, items: [{ key: "track", instructions: "Pick", criteria: { Good: null, x: 3 } }] },
      },
      {
        id: "n1",
        type: "noul",
        title: c.nodes[0].title,
        content: { state: { a: "{{STORAGE: c1.track}}" }, items: [{ key: "ready", instructions: " ", criteria: { maybe: "x", true: "" } }] },
      },
    );
    c.edges.push({ from: c.info.start, to: "c1", when: { key: "c1.track", operator: "eq", value: "x" } });
    c.edges.push({ from: "c1", to: "n1", when: { key: "c1.track", operator: "eq", value: "x" } });
    return true;
  }],
  ["system prompt without language", (c) => {
    c.info["system-prompt"] = "Be kind.";
    return true;
  }],
  ["not a course", (c) => {
    for (const k of Object.keys(c)) delete c[k];
    c.nodes = [];
    c.edges = "x";
    return true;
  }],
];

/** The editor refuses the course when the player does, and says what it always said. */
const check = (course: C) => {
  const lines = asScriptLines(validateRules(course).issues);
  const errors = lines.filter((l) => l.startsWith("ERROR"));
  const player = playerValidation(course).errors;
  expect(errors.length > 0, `editor:\n${errors.join("\n")}\nplayer:\n${player.join("\n")}`).toBe(player.length > 0);
  expect(lines).toMatchSnapshot();
};

describe.skipIf(!hasReference || !hasPhp)("validator parity with the player's validate.php", () => {
  for (const { slug, path } of SAMPLES) {
    const sample = loadSample(path);

    it(`${slug} as shipped`, () => check(sample));

    for (const [name, mutate] of MUTATIONS) {
      const broken = clone(sample);
      if (!mutate(broken)) continue;
      it(`${slug}: ${name}`, () => check(broken));
    }
  }
});
