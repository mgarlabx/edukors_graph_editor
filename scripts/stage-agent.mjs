#!/usr/bin/env node
/**
 * Puts together what the app carries of the agent, in src-tauri/agent-bundle/,
 * which `npm run app:build` copies to Contents/Resources/agent/ (see
 * src-tauri/tauri.bundle.conf.json and find_script in src-tauri/src/agent.rs).
 *
 *   node scripts/stage-agent.mjs
 *
 * It holds the agent's own files (the sidecar, the providers, the tools, the
 * MCP bridge) and a node_modules with only what they import: the Claude Agent
 * SDK, the MCP SDK and zod, with everything those need, copied from the
 * project's node_modules so that the versions are the package-lock's.
 *
 * No agent's own program is here. Claude Code, OpenCode, the Antigravity CLI
 * and Codex are the person's own install (hundreds of megabytes each, per
 * platform), which the agent finds on the machine and never ships. The Claude
 * Agent SDK comes without the native `claude` packages it lists as optional:
 * it is pointed at the person's `claude` (agent/providers/claude.mjs).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = join(ROOT, "node_modules");
const OUT = join(ROOT, "src-tauri", "agent-bundle");
const SDK = "@anthropic-ai/claude-agent-sdk";
/** What agent/*.mjs import from outside Node. */
const ENTRIES = [SDK, "zod", "@modelcontextprotocol/sdk"];
/** What must be where the bundle looks for it once staged. */
const CHECKS = [
  SDK,
  "@modelcontextprotocol/sdk/server/mcp.js",
  "@modelcontextprotocol/sdk/server/streamableHttp.js",
  "@modelcontextprotocol/sdk/server/sse.js",
  // The person's own servers, reached by the bridge as a client (agent/mcpProxy.mjs).
  "@modelcontextprotocol/sdk/client/index.js",
  "@modelcontextprotocol/sdk/client/stdio.js",
  "@modelcontextprotocol/sdk/client/streamableHttp.js",
  "@modelcontextprotocol/sdk/client/sse.js",
];
const manifest = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

/** Where Node would find `name` when it is required from `from`. */
function resolvePackage(name, from) {
  for (let dir = from; dir.startsWith(MODULES); dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  const top = join(MODULES, name);
  if (existsSync(join(top, "package.json"))) return top;
  throw new Error(`${name} (needed by ${relative(ROOT, from) || "agent/"}) is not in node_modules; run npm install`);
}

/** The packages the entries need, dependencies and peers, each once. */
function closure() {
  const found = new Set();
  const visit = (name, from) => {
    const dir = resolvePackage(name, from);
    if (found.has(dir)) return;
    found.add(dir);
    const pkg = manifest(dir);
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      const optionalPeer = pkg.peerDependenciesMeta?.[dep]?.optional && !pkg.dependencies?.[dep];
      if (optionalPeer && !existsSync(join(MODULES, dep))) continue;
      visit(dep, dir);
    }
  };
  for (const name of ENTRIES) visit(name, MODULES);
  return [...found];
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// The whole agent folder: the sidecar, the providers, the bridge and the prompt.
cpSync(join(ROOT, "agent"), OUT, { recursive: true });

const packages = closure();
for (const dir of packages) {
  cpSync(dir, join(OUT, "node_modules", relative(MODULES, dir)), {
    recursive: true,
    // A native `claude`, nested by npm, would only add weight.
    filter: (src) => !relative(dir, src).replaceAll("\\", "/").includes(`${SDK}-`),
  });
}

const version = manifest(join(MODULES, SDK)).version;

// What the providers and the bridge will import from the staged copy.
const fromAgent = createRequire(join(OUT, "mcpBridge.mjs"));
for (const entry of CHECKS) {
  try {
    fromAgent.resolve(entry);
  } catch {
    throw new Error(`${entry} is missing from the staged agent`);
  }
}

console.log(`agent staged in ${relative(ROOT, OUT)}/: ${packages.length} packages (SDK ${version})`);
