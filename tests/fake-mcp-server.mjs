#!/usr/bin/env node
// A stand-in for one of the person's own MCP servers, for the tests: a stdio
// server with a tool that echoes and one that says how often it was called.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

let echoes = 0;
const server = new McpServer({ name: "materiais", version: "1.0.0" });
server.registerTool("echo", { description: "Says the text back.", inputSchema: { text: z.string() } }, async ({ text }) => {
  echoes++;
  return { content: [{ type: "text", text: `eco: ${text}` }] };
});
server.registerTool("count", { description: "How many times echo ran.", inputSchema: {} }, async () => ({ content: [{ type: "text", text: String(echoes) }] }));
await server.connect(new StdioServerTransport());
