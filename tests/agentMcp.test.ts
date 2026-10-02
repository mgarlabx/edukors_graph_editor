/**
 * What the person adds to the agent: the MCP servers written in the
 * preferences (what is accepted, what is refused and why, how their tools are
 * named on screen) and the skills in the agent's folder, as its process reads
 * them and hands them to Claude Code.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMcpConfig, mcpToolName } from "../src/agent/mcpConfig";
// @ts-expect-error -- plain JS module of the agent's process
import * as ext from "../agent/extensions.mjs";

describe("agent MCP servers", () => {
  it("reads empty text as no servers", () => {
    expect(parseMcpConfig("")).toEqual({ servers: {} });
    expect(parseMcpConfig("  \n")).toEqual({ servers: {} });
  });

  it("takes a .mcp.json and the bare object of servers alike", () => {
    const servers = { files: { command: "npx", args: ["-y", "server-files"] }, docs: { type: "http", url: "https://example.org/mcp", headers: { Authorization: "Bearer x" } } };
    const expected = {
      files: { type: "stdio", command: "npx", args: ["-y", "server-files"] },
      docs: { type: "http", url: "https://example.org/mcp", headers: { Authorization: "Bearer x" } },
    };
    expect(parseMcpConfig(JSON.stringify({ mcpServers: servers }))).toEqual({ servers: expected });
    expect(parseMcpConfig(JSON.stringify(servers))).toEqual({ servers: expected });
  });

  it("keeps only the fields Claude Code knows", () => {
    const { servers } = parseMcpConfig(JSON.stringify({ a: { type: "sse", url: "http://localhost:3000/sse", timeout: 5000, extra: 1 } }));
    expect(servers).toEqual({ a: { type: "sse", url: "http://localhost:3000/sse", timeout: 5000 } });
  });

  it("says what is wrong, and accepts nothing then", () => {
    const problem = (text: string) => {
      const r = parseMcpConfig(text);
      expect(r.servers).toEqual({});
      return r.problem;
    };
    expect(problem("{")?.key).toBe("mcp.notJson");
    expect(problem("[]")?.key).toBe("mcp.notServers");
    expect(problem('{"mcpServers": 3}')?.key).toBe("mcp.notServers");
    expect(problem('{"a": 1}')).toEqual({ key: "mcp.notObject", params: { name: "a" } });
    expect(problem('{"a": {"args": []}}')).toEqual({ key: "mcp.noCommand", params: { name: "a" } });
    expect(problem('{"a": {"command": "x", "args": "y"}}')).toEqual({ key: "mcp.badField", params: { name: "a", field: "args" } });
    expect(problem('{"a": {"command": "x", "env": {"K": 1}}}')).toEqual({ key: "mcp.badField", params: { name: "a", field: "env" } });
    expect(problem('{"a": {"type": "http", "url": "ftp://x"}}')).toEqual({ key: "mcp.noUrl", params: { name: "a" } });
    expect(problem('{"a": {"type": "sdk"}}')).toEqual({ key: "mcp.badType", params: { name: "a", type: "sdk" } });
  });

  it("keeps the editor's own server name", () => {
    expect(parseMcpConfig('{"edukors": {"command": "x"}}').problem).toEqual({ key: "mcp.reserved", params: { name: "edukors" } });
  });

  it("names MCP tools by server and tool", () => {
    expect(mcpToolName("mcp__files__read_file")).toBe("files › read_file");
    expect(mcpToolName("mcp__my_srv__do__it")).toBe("my_srv › do__it");
    expect(mcpToolName("Bash")).toBe("Bash");
  });
});

describe("agent skills and servers, in the agent's process", () => {
  it("reads a SKILL.md's frontmatter: plain, quoted and folded values", () => {
    expect(ext.frontmatter("---\nname: quiz\ndescription: \"Makes quizzes: 3 questions\"\n---\nBody")).toEqual({ name: "quiz", description: "Makes quizzes: 3 questions" });
    expect(ext.frontmatter("---\nname: a\ndescription: >\n  Line one\n  line two\nlicense: MIT\n---\n")).toEqual({ name: "a", description: "Line one line two", license: "MIT" });
    expect(ext.frontmatter("No frontmatter")).toEqual({});
  });

  it("lists the skills of the plugin folder, and makes the folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "edukors-skills-"));
    try {
      ext.ensurePlugin(dir);
      expect(JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8")).name).toBe("edukors");
      expect(ext.listSkills(dir)).toEqual([]);
      mkdirSync(join(dir, "skills", "quiz"));
      writeFileSync(join(dir, "skills", "quiz", "SKILL.md"), "---\nname: quiz-maker\ndescription: Quizzes\n---\n");
      mkdirSync(join(dir, "skills", "plain"));
      writeFileSync(join(dir, "skills", "plain", "SKILL.md"), "Just text");
      mkdirSync(join(dir, "skills", "empty"));
      writeFileSync(join(dir, "skills", "loose.md"), "not a skill");
      const skills = ext.listSkills(dir);
      expect(skills).toEqual([
        { name: "plain", description: "", dir: "plain" },
        { name: "quiz-maker", description: "Quizzes", dir: "quiz" },
      ]);
      expect(ext.skillIds(skills)).toEqual(["edukors:plain", "edukors:quiz-maker", "edukors:quiz"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hands Claude Code only the servers it can be given", () => {
    const { servers, dropped } = ext.sanitizeServers(
      {
        files: { command: "npx", args: ["x"] },
        docs: { type: "http", url: "https://example.org/mcp" },
        edukors: { command: "x" },
        inproc: { type: "sdk", name: "x" },
        broken: { type: "sse", url: "file:///x" },
        "bad name": { command: "x" },
      },
      "edukors",
    );
    expect(servers).toEqual({ files: { type: "stdio", command: "npx", args: ["x"] }, docs: { type: "http", url: "https://example.org/mcp" } });
    expect(dropped).toEqual(["edukors", "inproc", "broken", "bad name"]);
    expect(ext.sanitizeServers(null, "edukors")).toEqual({ servers: {}, dropped: [] });
  });

  it("tells the person's MCP tools from the editor's", () => {
    expect(ext.isExternalMcp("mcp__files__read", "edukors")).toBe(true);
    expect(ext.isExternalMcp("mcp__edukors__edit_course", "edukors")).toBe(false);
    expect(ext.isExternalMcp("Bash", "edukors")).toBe(false);
  });
});
