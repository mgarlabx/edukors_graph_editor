/**
 * Inserting a node from the Insert menu or the toolbar's + list: the type
 * with the next free id, beside the selection, selected and framed on the
 * map, after what was being typed in the JSON tab.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "../src/store/editor";
import { dropDoc, onLeave, openDoc, useDocs } from "../src/store/docs";
import { INSERT_GROUPS, insertNode } from "../src/app/insert";
import { NODE_TYPES } from "../src/course/nodeTypes";
import type { Course } from "../src/schema/types";
import { positionsOf } from "../src/store/layout";
import { clone, loadSample, SAMPLES } from "./helpers";

const full = (): Course => clone(loadSample(SAMPLES[2].path));
const editor = () => useEditor.getState();

beforeEach(() => {
  for (const id of [...useDocs.getState().order]) dropDoc(id);
});

describe("insert", () => {
  it("lists the ten types once, in their order", () => {
    expect(INSERT_GROUPS.flatMap((g) => g.types)).toEqual(NODE_TYPES);
  });

  it("adds the type below the selected node, selects it and shows it on the map", () => {
    openDoc(full(), { path: null, saved: true });
    editor().setPositions({ q1: { x: 100, y: 40 }, f2: { x: 900, y: 300 } });
    editor().select({ nodes: ["q1"], edge: null });
    editor().setTab("preview");

    insertNode("score");
    expect(editor().course!.nodes.at(-1)).toMatchObject({ id: "s2", type: "score" });
    expect(positionsOf(editor().course).s2).toEqual({ x: 100, y: 240 });
    expect(editor().selection).toEqual({ nodes: ["s2"], edge: null });
    expect(editor().tab).toBe("canvas");
    expect(editor().focus?.node).toBe("s2");

    // With nothing selected: below the whole graph.
    editor().select({ nodes: [], edge: null });
    insertNode("static-md");
    expect(positionsOf(editor().course).sm6).toEqual({ x: 80, y: 500 });

    editor().undo();
    editor().undo();
    expect(editor().course!.nodes.some((n) => n.id === "s2" || n.id === "sm6")).toBe(false);
  });

  it("lets what is being typed in the JSON tab in first, so the new node is not lost", () => {
    openDoc(full(), { path: null, saved: true });
    editor().setTab("json");
    const typed = clone(editor().course!);
    typed.info.author = "Ana";
    let pending: Course | null = typed;
    const stop = onLeave(() => {
      if (pending) editor().replace(pending, "json");
      pending = null;
    });
    insertNode("quiz");
    stop();
    expect(editor().course!.info.author).toBe("Ana");
    expect(editor().course!.nodes.some((n) => n.id === "q2" && n.type === "quiz")).toBe(true);
  });

  it("does nothing with no course open", () => {
    insertNode("form");
    expect(editor().course).toBeNull();
  });
});
