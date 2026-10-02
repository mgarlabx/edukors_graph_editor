/**
 * Phase 1 criterion: opening and saving the three samples writes them back
 * byte for byte. And the graph edits keep what the format cares about: edge
 * order, references after a rename, a valid course after add/delete.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectStyle, stringify } from "../src/course/serialize";
import { addNode, connect, deleteNodes, duplicateNodes, outgoingIndexes, renameNode, reorderEdge } from "../src/course/ops";
import { addLanguage, makeSource, removeLanguage, renameLanguage } from "../src/i18n/languages";
import { coverage, textFields } from "../src/i18n/texts";
import { validateRules } from "../src/validate/rules";
import { diagnose } from "../src/validate";
import { newCourse } from "../src/course/factory";
import { holds } from "../src/course/condition";
import { invert } from "../src/conditions/ConditionEditor";
import { clone, loadSample, SAMPLES } from "./helpers";

const errors = (c: unknown) => diagnose(c).issues.filter((i) => i.level === "error");

describe("open and save", () => {
  for (const { slug, path } of SAMPLES) {
    it(`${slug} round-trips byte for byte`, () => {
      const raw = readFileSync(path, "utf8");
      expect(stringify(JSON.parse(raw), detectStyle(raw))).toBe(raw);
    });
  }

  it("a new course is valid, apart from what the author must write", () => {
    const c = newCourse("pt", "Curso");
    const left = errors(c).map((i) => i.where);
    expect(left.every((w) => w.startsWith("info.author") || w.startsWith("node sm1"))).toBe(true);
    c.info.author = "Edukors";
    c.nodes[0].content.item[0].text = "Texto ".repeat(50);
    expect(errors(c)).toEqual([]);
  });

  it("the three samples pass both layers with no error", () => {
    for (const { path } of SAMPLES) expect(errors(loadSample(path))).toEqual([]);
  });
});

describe("graph edits", () => {
  const full = () => clone(loadSample(SAMPLES[2].path));

  it("a new edge goes before the fallback, with a condition", () => {
    const c = full();
    const before = outgoingIndexes(c, "q1").map((i) => c.edges[i].to);
    connect(c, "q1", "sm5");
    const after = outgoingIndexes(c, "q1").map((i) => c.edges[i]);
    expect(after.map((e) => e.to)).toEqual([before[0], "sm5", before[1]]);
    expect(after[1].when).toBeTruthy();
    expect(after[2].when).toBeUndefined();
  });

  it("reordering moves an edge only among its node's edges", () => {
    const c = full();
    const others = c.edges.filter((e: { from: string }) => e.from !== "f1");
    reorderEdge(c, "f1", 2, 0);
    expect(outgoingIndexes(c, "f1").map((i) => c.edges[i].to)).toEqual(["sm3", "sh1", "sm2"]);
    expect(c.edges.filter((e: { from: string }) => e.from !== "f1")).toEqual(others);
  });

  it("renaming a node follows every reference", () => {
    const c = full();
    expect(renameNode(c, "s1", "s7")).toBe(true);
    const text = JSON.stringify(c);
    expect(text).not.toMatch(/"s1"|s1\.|STORAGE: s1/);
    expect(errors(c)).toEqual([]);
    expect(renameNode(c, "f1", "f2")).toBe(false);
  });

  it("deleting a node takes its edges, duplicating keeps the inner ones", () => {
    const c = full();
    deleteNodes(c, ["sm1"]);
    expect(c.edges.some((e: { from: string; to: string }) => e.from === "sm1" || e.to === "sm1")).toBe(false);
    expect(c.info.start).not.toBe("sm1");
    const d = full();
    const map = duplicateNodes(d, ["f2", "s1"]);
    expect(map).toEqual({ f2: "f3", s1: "s2" });
    expect(d.edges.some((e: { from: string; to: string }) => e.from === "f3" && e.to === "s2")).toBe(true);
  });

  it("a node added from the Insert menu has the next free id", () => {
    const c = full();
    expect(addNode(c, "score", ["en", "pt", "zh"])).toBe("s2");
    expect(addNode(c, "static-md", ["en"])).toBe("sm6");
  });

  it("inverting a condition negates it for every value (no `not` in the format)", () => {
    const when = { or: [{ key: "q1.percent", operator: "gte" as const, value: 70 }, { and: [{ key: "b1.answer", operator: "eq" as const, value: true }, { key: "f1.goal", operator: "contains" as const, value: "x" }] }] };
    for (const vars of [
      { "q1.percent": 80, "b1.answer": true, "f1.goal": "x" },
      { "q1.percent": 10, "b1.answer": true, "f1.goal": "y" },
      { "q1.percent": 10, "b1.answer": false, "f1.goal": "x" },
      { "q1.percent": 70, "b1.answer": false, "f1.goal": "" },
    ])
      expect(holds(invert(when), vars)).toBe(!holds(when, vars));
  });
});

describe("course languages", () => {
  it("adding a language opens an entry in every translatable text, and coverage sees it", () => {
    const c = clone(loadSample(SAMPLES[2].path));
    addLanguage(c, "es");
    expect(c.info["other-languages"]).toEqual(["pt", "zh", "es"]);
    const report = coverage(c, ["en", "pt", "zh", "es"]);
    const es = report.find((r) => r.lang === "es")!;
    expect(es.missing.length).toBe(es.total);
    expect(report.find((r) => r.lang === "pt")!.missing).toEqual([]);
    // prompts are never given a slot per language
    for (const f of textFields(c).filter((f) => !f.translatable)) expect(f.list.some((e) => e.lang === "es")).toBe(false);
  });

  it("removing a language takes it out of the whole course, prompts included", () => {
    const c = clone(loadSample(SAMPLES[2].path));
    removeLanguage(c, "zh");
    expect(JSON.stringify(c)).not.toContain('"lang":"zh"');
    expect(validateRules(c).issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("renaming and making a language the source keep the course valid", () => {
    const c = clone(loadSample(SAMPLES[2].path));
    renameLanguage(c, "pt", "pt-BR");
    makeSource(c, "pt-BR");
    expect(c.info["source-language"]).toBe("pt-BR");
    expect(c.info["other-languages"]).toEqual(["en", "zh"]);
    expect(c.nodes[0].title[0].lang).toBe("pt-BR");
    expect(validateRules(c).issues.filter((i) => i.level === "error")).toEqual([]);
  });
});
