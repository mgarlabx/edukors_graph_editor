/**
 * The main process's own rules (src/main): the OpenRouter key goes only to OpenRouter, an export never replaces
 * the course or its source, and the data of 2.20 is carried once, read only, without overwriting anything.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isOpenRouterUrl } from "../src/main/openrouter";
import { assertExportTarget, atomicWrite } from "../src/main/files";
import { legacyConversationsFor, legacyFolders, mapLegacyPrefs, migrateLegacy } from "../src/main/legacy";

const scratch = () => mkdtempSync(join(tmpdir(), "graph-main-"));

describe("OpenRouter", () => {
  it("is the only place the key goes", () => {
    expect(isOpenRouterUrl("https://openrouter.ai/api/v1/chat/completions")).toBe(true);
    for (const bad of ["https://openrouter.ai.example.org/x", "http://openrouter.ai/x", "https://user@openrouter.ai/x", "https://openrouter.ai:8443/x", "file:///etc/hosts", "nonsense"])
      expect(isOpenRouterUrl(bad)).toBe(false);
  });
});

describe("exports", () => {
  it("never replace the course, its source or any .egrx", async () => {
    const dir = scratch(), course = join(dir, "c.egrx"), source = join(dir, "c.egf");
    writeFileSync(course, "x");
    writeFileSync(source, "{}");
    await expect(assertExportTarget(join(dir, "other.egrx"), [])).rejects.toThrow(/egrx/);
    await expect(assertExportTarget(source, [course, source])).rejects.toThrow(/stay unchanged/);
    await expect(assertExportTarget(join(dir, "c-copy.egf"), [course, source])).resolves.toBeUndefined();
  });

  it("are written whole", async () => {
    const file = join(scratch(), "sub", "a.egf");
    await atomicWrite(file, "one");
    await atomicWrite(file, "two");
    expect(readFileSync(file, "utf8")).toBe("two");
  });
});

describe("data of 2.20", () => {
  const prefs = {
    uiLang: "es", theme: "dark", terms: "2026-10-01", recent: ["/a/x.egf"], editorWrap: false,
    ai: { model: "m", maxTokens: 1200, timeout: 45, url: "https://openrouter.ai/api/v1/chat/completions", temperature: 1 },
    judge: { model: "j", minConfidence: 0.7, strictModel: true, url: "x", timeout: 45 },
    agent: { account: "acc-1", accounts: { "acc-1": { model: "opus", effort: "high" }, "bad id": { model: "x", effort: "" } }, mode: "auto", width: 420, instructions: "Be brief.", mcp: '{"mcpServers":{}}' },
    sidebar: { inspector: 400, preview: 440 },
  };

  it("maps every setting to its new place", () => {
    const { graph, aiSettings, seed } = mapLegacyPrefs(prefs);
    expect(graph).toEqual({ ai: { model: "m", maxTokens: 1200, timeout: 45, url: "https://openrouter.ai/api/v1/chat/completions" }, judge: { model: "j", minConfidence: 0.7, timeout: 45 }, editorWrap: false, sidebar: { inspector: 400, preview: 440 } });
    expect(aiSettings).toEqual({ instructions: "Be brief.", mcp: '{"mcpServers":{}}', defaultAccountId: "acc-1", choices: { "acc-1": { model: "opus", effort: "high" } }, mode: "auto" });
    expect(seed).toEqual({ language: "es", theme: "dark", terms: "2026-10-01", recent: ["/a/x.egf"], assistantWidth: 420 });
    expect(mapLegacyPrefs("garbage")).toEqual({ graph: {}, aiSettings: {}, seed: {} });
  });

  it("is carried once, without touching the old folder or overwriting", async () => {
    const legacy = scratch(), data = scratch();
    writeFileSync(join(legacy, "prefs.json"), JSON.stringify(prefs));
    mkdirSync(join(legacy, "agent", "plugin", "skills", "glossary"), { recursive: true });
    writeFileSync(join(legacy, "agent", "plugin", "skills", "glossary", "SKILL.md"), "---\nname: glossary\n---\n");
    mkdirSync(join(legacy, "agent", "history"), { recursive: true });
    writeFileSync(join(legacy, "agent", "history", "c1.json"), "{}");
    writeFileSync(join(legacy, "agent", "history", "c1.meta.json"), "{}");
    mkdirSync(join(data, "skills", "mine"), { recursive: true });
    writeFileSync(join(data, "ai-settings.json"), '{"instructions":"already here"}');
    const before = readFileSync(join(legacy, "prefs.json"), "utf8");

    const report: any = await migrateLegacy({ dataDir: data, legacyDir: legacy });
    expect(report.skills).toEqual(["glossary"]);
    expect(report.conversations).toBe(2);
    expect(JSON.parse(readFileSync(join(data, "ai-settings.json"), "utf8"))).toEqual({ instructions: "already here" });
    expect(JSON.parse(readFileSync(join(data, "graph-preferences.json"), "utf8")).seed.language).toBe("es");
    expect(existsSync(join(data, "skills", "glossary", "SKILL.md"))).toBe(true);
    expect(readdirSync(join(data, "legacy-conversations")).sort()).toEqual(["c1.json", "c1.meta.json"]);
    expect(readFileSync(join(legacy, "prefs.json"), "utf8")).toBe(before);
    expect(await migrateLegacy({ dataDir: data, legacyDir: legacy })).toEqual({ skipped: true });
  });

  it("carries the accepted terms, the recent courses still there, and the conversations about a course", async () => {
    const legacy = scratch(), data = scratch(), course = join(legacy, "curso.egf");
    writeFileSync(course, "{}");
    writeFileSync(join(legacy, "prefs.json"), JSON.stringify({ terms: "2026-10-06", recent: [course, join(legacy, "gone.egf"), "relative.egf"] }));
    mkdirSync(join(legacy, "agent", "history"), { recursive: true });
    writeFileSync(join(legacy, "agent", "history", "c1.meta.json"), JSON.stringify({ id: "c1", coursePath: course }));
    writeFileSync(join(legacy, "agent", "history", "c1.json"), JSON.stringify({ id: "c1", items: [{ kind: "user", text: "oi" }] }));
    writeFileSync(join(legacy, "agent", "history", "c2.meta.json"), JSON.stringify({ id: "c2", coursePath: "/other.egf" }));
    writeFileSync(join(legacy, "agent", "history", "c2.json"), "{}");
    await migrateLegacy({ dataDir: data, legacyDir: legacy });
    expect(JSON.parse(readFileSync(join(data, "terms.json"), "utf8")).accepted).toBe("2026-10-06");
    expect(JSON.parse(readFileSync(join(data, "recent.json"), "utf8")).recent.map((r: { path: string }) => r.path)).toEqual([course]);
    const bytes = await legacyConversationsFor(data, course);
    expect(JSON.parse(new TextDecoder().decode(bytes!))).toEqual([{ id: "c1", items: [{ kind: "user", text: "oi" }] }]);
    expect(await legacyConversationsFor(data, "/nothing.egf")).toBeNull();
  });

  it("is looked for where 2.20 kept it", () => {
    expect(legacyFolders("darwin", {}, "/Users/a").config).toBe("/Users/a/Library/Application Support/org.edukors.grapheditor");
    expect(legacyFolders("linux", {}, "/home/a")).toEqual({ config: "/home/a/.config/org.edukors.grapheditor", data: "/home/a/.local/share/org.edukors.grapheditor" });
  });
});
