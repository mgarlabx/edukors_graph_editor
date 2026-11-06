/**
 * The .egrx course file (src/course/egrx.ts): an .egf opened, saved as .egrx, opened again and exported as .egf
 * gives back the same bytes; reading is strict; the AI conversations of 2.19-2.20 are kept whole.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeEgrx, encodeEgrx, exportEgf, importEgf } from "../src/course/egrx";
import { GRAPH, SAMPLES } from "./helpers";

const corpus = [
  ...SAMPLES.map(({ slug, path }) => ({ name: slug, path })),
  ...(existsSync(join(GRAPH, "samples")) ? readdirSync(join(GRAPH, "samples")).filter((f) => f.endsWith(".egf")).map((f) => ({ name: f, path: join(GRAPH, "samples", f) })) : []),
];

describe(".egf → .egrx → .egf", () => {
  for (const { name, path } of corpus) {
    it(`${name} comes back byte for byte`, async () => {
      const raw = readFileSync(path, "utf8");
      const opened = await decodeEgrx(await encodeEgrx(importEgf(raw)));
      expect(opened.course).toEqual(JSON.parse(raw));
      expect(exportEgf(opened)).toBe(raw);
    });
  }
});

describe("reading is strict", () => {
  const P = () => (globalThis as any).EdukorsPackage;

  it("refuses what is not a course package", async () => {
    await expect(decodeEgrx(new TextEncoder().encode("{}"))).rejects.toThrow();
    const other = await P().write({ app: { name: "text", version: "x" }, main: { name: "text/document.json", contentType: P().contentType("text", "document"), content: { format: "edukors.text.document", version: 1, doc: {} } } });
    await expect(decodeEgrx(other)).rejects.toThrow(/another EDUKORS app/);
  });

  it("refuses a course saved by a newer version", async () => {
    const newer = await P().write({ app: { name: "graph", version: "x" }, main: { name: "graph/course.json", contentType: P().contentType("graph", "course"), content: { format: "edukors.graph.course", version: 2, course: { nodes: [] } } } });
    await expect(decodeEgrx(newer)).rejects.toThrow(/newer version/);
  });

  it("refuses a .egf that is not a course, saying where JSON breaks", () => {
    expect(() => importEgf('{\n  "a": 1,\n}')).toThrow(/line 3/);
    expect(() => importEgf("[1,2]")).toThrow(/not an Edukors Graph course/);
  });

  it("keeps the conversations of earlier versions whole", async () => {
    const file = importEgf(readFileSync(SAMPLES[0].path, "utf8"));
    const legacy = new TextEncoder().encode('[{"id":"c1"}]');
    const opened = await decodeEgrx(await encodeEgrx({ ...file, legacyConversations: legacy }));
    expect(new TextDecoder().decode(opened.legacyConversations)).toBe('[{"id":"c1"}]');
  });
});
