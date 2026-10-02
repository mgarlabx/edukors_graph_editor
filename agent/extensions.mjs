// @ts-check
/**
 * What the person adds to the agent, beyond the editor's own tools: skills and
 * MCP servers. Both come from the editor, never from the person's own Claude
 * Code setup (sidecar.mjs keeps `settingSources: []`).
 *
 * - Skills live in a folder of the app, laid out as a local Claude Code plugin
 *   named "edukors": `<dir>/.claude-plugin/plugin.json` and
 *   `<dir>/skills/<name>/SKILL.md`. Only the skills found there are enabled,
 *   by name, so Claude Code's own bundled skills stay out.
 * - MCP servers come from the preferences, already checked by the panel
 *   (src/agent/mcpConfig.ts); they are checked again here, since this process
 *   is what hands them to Claude Code.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PLUGIN_NAME = "edukors";

/**
 * Makes the plugin folder, if it is not there yet.
 * @param {string} dir
 */
export function ensurePlugin(dir) {
  mkdirSync(join(dir, "skills"), { recursive: true });
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  const manifest = join(dir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifest))
    writeFileSync(manifest, JSON.stringify({ name: PLUGIN_NAME, description: "The skills of the Edukors Graph Editor's AI agent." }, null, 2) + "\n");
}

/**
 * The fields of a SKILL.md's YAML frontmatter that matter here: one-line
 * values, quoted or not, and folded or literal blocks (`>`, `|`).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function frontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(text);
  if (!m) return {};
  /** @type {Record<string, string>} */
  const fields = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^[>|][+-]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim());
      value = value.startsWith(">") ? block.filter(Boolean).join(" ") : block.join("\n").trim();
    } else if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    fields[kv[1]] = value;
  }
  return fields;
}

/**
 * @typedef {{ name: string; description: string; dir: string }} Skill
 */

/**
 * The skills in the plugin folder: each subfolder of `skills/` with a SKILL.md.
 * The name is the frontmatter's, or the folder's.
 * @param {string} dir the plugin folder
 * @param {(...args: unknown[]) => void} [log]
 * @returns {Skill[]}
 */
export function listSkills(dir, log = () => {}) {
  const root = join(dir, "skills");
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  /** @type {Skill[]} */
  const skills = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    const folder = join(root, entry);
    const file = join(folder, "SKILL.md");
    try {
      if (!statSync(folder).isDirectory()) continue;
      const fields = frontmatter(readFileSync(file, "utf8"));
      skills.push({ name: fields.name || entry, description: fields.description ?? "", dir: entry });
    } catch (e) {
      log("skill skipped:", entry, String(/** @type {Error} */ (e)?.message ?? e));
    }
  }
  return skills;
}

/**
 * The names to enable the skills by: plugin-qualified, by name and by folder.
 * @param {Skill[]} skills
 */
export const skillIds = (skills) => [...new Set(skills.flatMap((s) => [`${PLUGIN_NAME}:${s.name}`, `${PLUGIN_NAME}:${s.dir}`]))];

const isObject = (/** @type {unknown} */ v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The person's MCP servers that Claude Code can be given: processes (stdio)
 * and URLs (http, sse). The editor's own server keeps its name; in-process
 * ("sdk") servers can only come from this code.
 * @param {unknown} raw
 * @param {string} reserved the editor's server name
 * @returns {{ servers: Record<string, import("@anthropic-ai/claude-agent-sdk").McpServerConfig>; dropped: string[] }}
 */
export function sanitizeServers(raw, reserved) {
  /** @type {Record<string, any>} */
  const servers = {};
  /** @type {string[]} */
  const dropped = [];
  if (!isObject(raw)) return { servers, dropped };
  for (const [name, s] of Object.entries(/** @type {Record<string, any>} */ (raw))) {
    const type = isObject(s) ? (s.type ?? "stdio") : null;
    const ok =
      name !== reserved &&
      /^[A-Za-z0-9_.-]+$/.test(name) &&
      ((type === "stdio" && typeof s.command === "string" && s.command.trim()) || ((type === "http" || type === "sse") && typeof s.url === "string" && /^https?:\/\//.test(s.url)));
    if (ok) servers[name] = { ...s, type };
    else dropped.push(name);
  }
  return { servers, dropped };
}

/**
 * Whether a tool comes from one of the person's MCP servers, not the editor's.
 * @param {string} toolName
 * @param {string} reserved the editor's server name
 */
export const isExternalMcp = (toolName, reserved) => toolName.startsWith("mcp__") && !toolName.startsWith(`mcp__${reserved}__`);

/**
 * The servers' state for the panel: name, status and error, the editor's own left out.
 * @param {import("@anthropic-ai/claude-agent-sdk").McpServerStatus[]} list
 * @param {string} reserved
 */
export const serverStates = (list, reserved) =>
  list.filter((s) => s.name !== reserved).map((s) => ({ name: s.name, status: s.status, ...(s.error ? { error: s.error } : {}) }));
