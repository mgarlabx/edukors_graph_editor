import { describe, expect, it } from "vitest";
import { parseMcpConfig, mcpToolName } from "../src/agent/mcpConfig";
import en from "../src/i18n/locales/en.json";

describe("agent MCP servers in the preferences", () => {
  it("reads the .mcp.json the preferences show as the example", () => {
    const text = `{
  "mcpServers": {
    "files": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Courses"] },
    "docs": { "type": "http", "url": "https://example.org/mcp" }
  }
}`;
    const { servers, problem } = parseMcpConfig(text);
    expect(problem).toBeUndefined();
    expect(servers).toEqual({
      files: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Courses"] },
      docs: { type: "http", url: "https://example.org/mcp" },
    });
  });

  it("turns every problem into a message the preferences can show", () => {
    const { problems } = parseMcpConfig('{ "edukors": { "command": "x" }, "my.server": { "command": "x" }, "web": { "type": "sse" } }');
    expect(problems.map((p) => p.key)).toEqual(["mcp.reserved", "mcp.badName", "mcp.noUrl"]);
    for (const code of ["notJson", "notServers", "reserved", "badName", "notObject", "noCommand", "noUrl", "badField", "badType"])
      expect(en).toHaveProperty([`mcp.${code}`]);
    expect(parseMcpConfig("").problem).toBeUndefined();
    expect(parseMcpConfig("{").problem?.key).toBe("mcp.notJson");
  });

  it("names a server's tool for the conversation", () => {
    expect(mcpToolName("mcp__docs__search")).toBe("docs › search");
    expect(mcpToolName("read_course")).toBe("read_course");
  });
});
