/**
 * Several courses open at once, one per tab: each keeps its own course,
 * history, selection and preview while another is on screen, and nodes copied
 * in one paste into another -- with fresh ids, the references inside the
 * group following them, and the texts in the languages of the course they
 * land in.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { isDirty, useEditor } from "../src/store/editor";
import { activateDoc, activateNth, cycleDoc, dirtyDocs, docState, dropDoc, onLeave, openDoc, patchDoc, useDocs } from "../src/store/docs";
import { usePreview } from "../src/preview/session";
import { pasteClip, readClip, selectionClip, textSelected } from "../src/app/clipboard";
import { docLabel, withEgf } from "../src/app/files";
import { duplicateNodes, pasteNodes } from "../src/course/ops";
import { fitLanguages } from "../src/i18n/languages";
import { newCourse } from "../src/course/factory";
import { diagnose } from "../src/validate";
import type { Course, CourseNode } from "../src/schema/types";
import { positionsOf } from "../src/store/layout";
import { clone, loadSample, SAMPLES } from "./helpers";

const full = (): Course => clone(loadSample(SAMPLES[2].path));
const editor = () => useEditor.getState();
const ids = () => editor().course!.nodes.map((n) => n.id);
const node = (id: string) => editor().course!.nodes.find((n) => n.id === id)!;
const errors = (c: Course) => diagnose(c).issues.filter((i) => i.level === "error");

/** Copies nodes of the course on screen, as ⌘C on the canvas does. */
const copy = (...nodes: string[]) => {
  editor().select({ nodes, edge: null });
  return selectionClip()!;
};

beforeEach(() => {
  for (const id of [...useDocs.getState().order]) dropDoc(id);
});

describe("tabs", () => {
  it("each course keeps its own state while another is on screen", () => {
    const a = openDoc(full(), { path: "/courses/a.json", saved: true });
    editor().select({ nodes: ["q1"], edge: null });
    editor().update((c) => (c.info.author = "Ana"), "author");
    const b = openDoc(newCourse("pt", "Novo"), { path: null, saved: true });

    expect(useDocs.getState().order).toEqual([a, b]);
    expect(editor().docId).toBe(b);
    expect(ids()).toEqual(["sm1"]);
    expect(editor().past).toEqual([]);
    expect(editor().selection.nodes).toEqual([]);

    activateDoc(a);
    expect(editor().course!.info.author).toBe("Ana");
    expect(editor().selection.nodes).toEqual(["q1"]);
    expect(editor().path).toBe("/courses/a.json");
    editor().undo();
    expect(editor().course!.info.author).not.toBe("Ana");
    // b was not touched by a's undo
    expect(docState(b)!.course!.nodes.map((n) => n.id)).toEqual(["sm1"]);
  });

  it("closing the tab on screen shows its right neighbour, then the left; the last leaves no course", () => {
    const a = openDoc(full(), { path: null, saved: true });
    const b = openDoc(full(), { path: null, saved: true });
    const c = openDoc(full(), { path: null, saved: true });
    activateDoc(b);
    dropDoc(b);
    expect(editor().docId).toBe(c);
    dropDoc(c);
    expect(editor().docId).toBe(a);
    dropDoc(a);
    expect(editor().docId).toBeNull();
    expect(editor().course).toBeNull();
    expect(useDocs.getState()).toMatchObject({ order: [], parked: {} });
  });

  it("goes round the tabs, and ⌘9 is the last one", () => {
    const [a, b, c] = [0, 1, 2].map(() => openDoc(full(), { path: null, saved: true }));
    cycleDoc(1);
    expect(editor().docId).toBe(a);
    cycleDoc(-1);
    expect(editor().docId).toBe(c);
    activateNth(2);
    expect(editor().docId).toBe(b);
    activateNth(9);
    expect(editor().docId).toBe(c);
  });

  it("what is on its way into a course goes in before it leaves the screen", () => {
    const a = openDoc(full(), { path: null, saved: true });
    let pending = true;
    const stop = onLeave(() => {
      // still on screen when this runs
      if (pending && editor().docId === a) editor().update((c) => (c.info.version = "9.9"), "json");
      pending = false;
    });
    openDoc(full(), { path: null, saved: true });
    stop();
    expect(editor().course!.info.version).not.toBe("9.9");
    expect(docState(a)!.course!.info.version).toBe("9.9");
  });

  it("a save that ends after its tab was left marks that tab, not the one on screen", () => {
    const a = openDoc(full(), { path: null, saved: true });
    editor().update((c) => (c.info.author = "Ana"), "author");
    const written = editor().course;
    const b = openDoc(full(), { path: null, saved: true });
    editor().update((c) => (c.info.author = "Bia"), "author");
    patchDoc(a, { path: "/courses/a.json", savedCourse: written });
    expect(isDirty(docState(a)!)).toBe(false);
    expect(docState(a)!.path).toBe("/courses/a.json");
    expect(isDirty(editor())).toBe(true);
    expect(dirtyDocs()).toEqual([b]);
  });

  it("the preview's student, calls and console belong to their course", () => {
    const a = openDoc(full(), { path: null, saved: true });
    usePreview.getState().record({ lang: "en", currentId: "f2", history: ["sm1", "f1"], vars: {}, answers: {} }, null);
    usePreview.getState().logConsole({ level: "error", text: "boom", frame: "step", title: "Quiz", at: 0 });
    const doc = usePreview.getState().doc;
    openDoc(full(), { path: null, saved: true });
    expect(usePreview.getState().states).toEqual([]);
    expect(usePreview.getState().console).toEqual([]);
    // an answer from the AI, or a console line, that arrives after the tab was left goes to that tab
    usePreview.getState().log({ node: "s1", kind: "judge", endpoint: "decisions", model: "m", answered: "m", tokensIn: 1, tokensOut: 1, cost: 0.01, ms: 5, ok: true, note: "", request: null, response: "" }, doc);
    usePreview.getState().logConsole({ level: "log", text: "late", frame: "player", title: null, at: 0 }, doc);
    expect(usePreview.getState().calls).toEqual([]);
    expect(usePreview.getState().console).toEqual([]);
    activateDoc(a);
    expect(usePreview.getState().calls.map((c) => c.node)).toEqual(["s1"]);
    expect(usePreview.getState().console.map((c) => c.text)).toEqual(["boom", "late"]);
    // the player picks up where the student was
    expect(usePreview.getState().seed?.currentId).toBe("f2");
    // a new student starts a new console
    usePreview.getState().restart();
    expect(usePreview.getState().console).toEqual([]);
  });

  it("a tab is named after its file, or its course's title until it has one", () => {
    expect(docLabel({ path: "/x/y/curso.egf", course: full() })).toBe("curso.egf");
    expect(docLabel({ path: null, course: full() })).toBe("Cats of the World 3 (full)");
    const untitled = newCourse("pt", "");
    expect(docLabel({ path: null, course: untitled })).toBe("Sem título");
  });

  it("a course is saved as .egf, an older .json one next to it", () => {
    expect(withEgf("/x/curso.egf")).toBe("/x/curso.egf");
    expect(withEgf("/x/curso.EGF")).toBe("/x/curso.EGF");
    expect(withEgf("/x/curso.json")).toBe("/x/curso.egf");
    expect(withEgf("/x/curso")).toBe("/x/curso.egf");
  });
});

describe("copying nodes from one course to another", () => {
  it("pastes with fresh ids, the references inside the group following them", () => {
    openDoc(full(), { path: null, saved: true });
    const text = copy("f2", "s1", "dm3");
    const b = openDoc(newCourse("en", "Target"), { path: null, saved: true });
    editor().update((c) => {
      // ids already taken in the target: the group must move to new ones
      pasteNodes(c, [structuredClone(full().nodes.find((n) => n.id === "f2")!), structuredClone(full().nodes.find((n) => n.id === "s1")!)], []);
    }, "seed");
    expect(ids()).toEqual(["sm1", "f1", "s1"]);

    expect(pasteClip(text)).toBe(true);
    expect(editor().docId).toBe(b);
    expect(ids()).toEqual(["sm1", "f1", "s1", "f2", "s2", "dm1"]);
    expect(editor().selection.nodes).toEqual(["f2", "s2", "dm1"]);
    // the judge reads the pasted form, the dynamic step follows the pasted judge
    expect(node("s2").content.state.answer).toBe("{{STORAGE: f2.text}}");
    expect(node("dm1").content.from).toBe("s2");
    // only the edges inside the group come along, renamed, condition included
    const added = editor().course!.edges.slice(-2);
    expect(added).toEqual([
      { from: "f2", to: "s2" },
      { from: "s2", to: "dm1", when: { key: "s2.percent", operator: "gte", value: 60 } },
    ]);
    // sections 3 is not in the target: dropped
    expect(["f2", "s2", "dm1"].map((id) => node(id).section)).toEqual([undefined, undefined, undefined]);
    // every pasted node has a place
    for (const id of ["f2", "s2", "dm1"]) expect(positionsOf(editor().course)[id]).toBeDefined();
  });

  it("keeps the arrangement of the copied nodes and never lands exactly on them twice", () => {
    openDoc(full(), { path: null, saved: true });
    editor().setPositions({ f2: { x: 100, y: 100 }, s1: { x: 400, y: 160 } });
    const text = copy("f2", "s1");
    openDoc(newCourse("en", "Target"), { path: null, saved: true });
    pasteClip(text);
    const first = positionsOf(editor().course);
    expect(first.s1.x - first.f1.x).toBe(300);
    expect(first.s1.y - first.f1.y).toBe(60);
    pasteClip(text);
    const second = positionsOf(editor().course);
    expect(second.f2).not.toEqual(first.f1);
    expect(second.s2.x - second.f2.x).toBe(300);
  });

  it("in the course they came from, pastes beside the originals", () => {
    openDoc(full(), { path: null, saved: true });
    editor().setPositions({ q1: { x: 500, y: 200 } });
    pasteClip(copy("q1"));
    expect(positionsOf(editor().course).q2).toEqual({ x: 560, y: 260 });
  });

  it("speaks the languages of the course it lands in", () => {
    openDoc(full(), { path: null, saved: true });
    const text = copy("q1");
    openDoc(newCourse("pt", "Destino"), { path: null, saved: true });
    pasteClip(text);
    const quiz = node("q1");
    const source = full().nodes.find((n) => n.id === "q1")!;
    // pt was already written in the sample: kept as it was; en and zh are not in this course
    expect(quiz.title).toEqual(source.title.filter((e) => e.lang === "pt"));
    expect(errors(editor().course!).filter((i) => i.where.startsWith("node q1"))).toEqual([]);
  });

  it("a course in a language the nodes lack gets their text to translate, not an empty field", () => {
    openDoc(full(), { path: null, saved: true });
    const text = copy("sm1");
    openDoc(newCourse("es", "Destino"), { path: null, saved: true });
    editor().update((c) => (c.info["other-languages"] = ["en"]), "langs");
    pasteClip(text);
    const step = node("sm2");
    const source = full().nodes.find((n) => n.id === "sm1")!;
    const en = source.content.item.find((e: { lang: string }) => e.lang === "en").text;
    expect(step.content.item).toEqual([
      { lang: "es", text: en },
      { lang: "en", text: en },
    ]);
  });

  it("pastes node JSON copied from the JSON tab: one node, a list, or a whole course", () => {
    const sample = full();
    openDoc(newCourse("en", "Target"), { path: null, saved: true });
    expect(pasteClip(JSON.stringify(sample.nodes.find((n) => n.id === "b1"), null, 2))).toBe(true);
    expect(ids()).toEqual(["sm1", "b1"]);
    expect(pasteClip(JSON.stringify(sample))).toBe(true);
    expect(ids().length).toBe(2 + sample.nodes.length);
    expect(editor().course!.edges.length).toBe(sample.edges.length);
    expect(readClip('{"nodes": [{"id": "x"}]}')).toBeNull();
    expect(readClip("[1, 2]")).toBeNull();
    expect(readClip("not json")).toBeNull();
    expect(pasteClip('{"title": "nothing to paste"}')).toBe(false);
  });
});

describe("graph edits that copy nodes", () => {
  it("duplicating a form with its judge makes the copy judge the copied form", () => {
    const c = full();
    const map = duplicateNodes(c, ["f2", "s1"]);
    expect(map).toEqual({ f2: "f3", s1: "s2" });
    const s2 = c.nodes.find((n) => n.id === "s2")!;
    expect(s2.content.state.answer).toBe("{{STORAGE: f3.text}}");
    // the original is untouched, and the copy's key is one the course has
    expect(c.nodes.find((n) => n.id === "s1")!.content.state.answer).toBe("{{STORAGE: f2.text}}");
    // (nothing leads into the copies yet: that is the only error)
    expect(errors(c).map((i) => i.where)).toEqual(["graph"]);
  });

  it("a reference to a node left behind is kept as it was", () => {
    const c = full();
    const map = pasteNodes(c, [clone(c.nodes.find((n) => n.id === "s1")!)], []);
    expect(c.nodes.find((n) => n.id === map.s1)!.content.state.answer).toBe("{{STORAGE: f2.text}}");
  });

  it("renames all at once, so one rename never feeds another", () => {
    const c = full();
    // s1 is pasted as s2 while an s2 is pasted as s3: the copy of s1 must not end up pointing at s3
    const s1 = clone(c.nodes.find((n) => n.id === "s1")!) as CourseNode;
    const s2 = { ...clone(s1), id: "s2" } as CourseNode;
    const dm = { ...clone(c.nodes.find((n) => n.id === "dm3")!), id: "dm9" } as CourseNode;
    const map = pasteNodes(c, [s1, s2, dm], []);
    expect(map).toEqual({ s1: "s2", s2: "s3", dm9: "dm4" });
    expect(c.nodes.find((n) => n.id === "dm4")!.content.from).toBe("s2");
  });
});

describe("fitting nodes to a course's languages", () => {
  const nodes = () => full().nodes.filter((n) => ["sm1", "dm1"].includes(n.id));

  it("leaves nodes alone when the languages are the same", () => {
    const list = nodes();
    expect(fitLanguages(list, ["en", "pt", "zh"], ["en", "pt", "zh"])).toBe(list);
  });

  it("drops languages the course lacks, adds empty entries for the ones it has", () => {
    const [sm1, dm1] = fitLanguages(nodes(), ["en", "pt", "zh"], ["pt", "es"]);
    expect(sm1.title.map((e) => e.lang)).toEqual(["pt", "es"]);
    expect(sm1.title[1].text).toBe("");
    // a prompt is never given a slot per language
    expect(dm1.content.prompt.map((e: { lang: string }) => e.lang)).toEqual(["pt"]);
  });
});

/**
 * A DOM selection, as much of one as the decision reads. `closest` answers for
 * an element inside the canvas and for one outside it.
 */
const selection = (text: string, inCanvas: boolean) =>
  ({
    isCollapsed: !text,
    toString: () => text,
    anchorNode: { nodeType: 3, parentElement: { closest: (sel: string) => (inCanvas && sel === ".canvas" ? {} : null) } },
  }) as unknown as Selection;

describe("copying with text selected", () => {
  it("copies the text the person highlighted off the canvas, not the nodes behind it", () => {
    expect(textSelected(selection("o agente disse isto", false))).toBe(true);
  });

  it("copies the nodes when the selection is on the canvas, or empty, or none", () => {
    expect(textSelected(selection("um nó", true))).toBe(false);
    expect(textSelected(selection("", false))).toBe(false);
    expect(textSelected(selection("   \n ", false))).toBe(false);
    expect(textSelected(null)).toBe(false);
  });
});
