/**
 * Where the nodes sit is part of the course: each node carries its own
 * `position`, saved with it, undone with it, and checked like the rest.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { isDirty, useEditor } from "../src/store/editor";
import { dropDoc, openDoc, useDocs } from "../src/store/docs";
import { runTool } from "../src/agent/editorTools";
import { stringify } from "../src/course/serialize";
import { diagnose } from "../src/validate";
import type { Course } from "../src/schema/types";
import { positionsOf } from "../src/store/layout";
import { clone, loadSample, SAMPLES } from "./helpers";

const mini = (): Course => clone(loadSample(SAMPLES[0].path));
const editor = () => useEditor.getState();
const node = (id: string) => editor().course!.nodes.find((n) => n.id === id)!;
const errors = (c: Course) => diagnose(c).issues.filter((i) => i.level === "error");

beforeEach(() => {
  for (const id of [...useDocs.getState().order]) dropDoc(id);
});

describe("positions", () => {
  it("go into the nodes, rounded, before the title", () => {
    openDoc(mini(), { path: null, saved: true });
    editor().setPositions({ sm1: { x: 10.4, y: -20.6 } });
    expect(node("sm1").position).toEqual({ x: 10, y: -21 });
    expect(Object.keys(node("sm1")).indexOf("position")).toBe(Object.keys(node("sm1")).indexOf("title") - 1);
    expect(positionsOf(editor().course)).toEqual({ sm1: { x: 10, y: -21 } });
    expect(stringify(editor().course!, editor().style)).toContain('"position"');
    expect(errors(editor().course!)).toEqual([]);
  });

  it("leave the course untouched when nothing moves", () => {
    openDoc(mini(), { path: null, saved: true });
    editor().setPositions({ sm1: { x: 0, y: 0 } });
    const placed = editor().course;
    editor().setPositions({ sm1: { x: 0, y: 0 }, zz9: { x: 5, y: 5 } });
    expect(editor().course).toBe(placed);
    expect(positionsOf(editor().course)).toBe(positionsOf(placed));
  });

  it("are a change to the course, undone as one step", () => {
    openDoc(mini(), { path: null, saved: true });
    const opened = editor().course;
    editor().setPositions({ sm1: { x: 100, y: 0 }, sm5: { x: 300, y: 0 } }, true);
    expect(isDirty(editor())).toBe(true);
    editor().undo();
    expect(editor().course).toBe(opened);
    expect(isDirty(editor())).toBe(false);
    editor().redo();
    expect(positionsOf(editor().course).sm5).toEqual({ x: 300, y: 0 });
  });

  it("stay put when the agent writes the course again without them", async () => {
    const a = openDoc(mini(), { path: null, saved: true });
    editor().setPositions({ sm1: { x: 0, y: 0 }, sm5: { x: 600, y: 80 } });
    const next = clone(editor().course!);
    for (const n of next.nodes) delete n.position;
    next.nodes.find((n) => n.id === "sm1")!.position = { x: 40, y: 40 };
    await runTool("replace_course", { course: next }, a);
    expect(positionsOf(editor().course).sm1).toEqual({ x: 40, y: 40 });
    expect(positionsOf(editor().course).sm5).toEqual({ x: 600, y: 80 });
    expect(editor().past).toHaveLength(1);
  });

  it("are checked as the builder's validator checks them", () => {
    const c = mini();
    c.nodes[0].position = { x: "10", y: 0 } as never;
    expect(errors(c).some((i) => i.code === "rule.node-position" && i.node === c.nodes[0].id)).toBe(true);
    c.nodes[0].position = { x: 1, y: 2, z: 3 } as never;
    expect(errors(c).some((i) => i.code === "rule.unknown-field")).toBe(true);
  });
});
