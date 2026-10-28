#!/usr/bin/env node
/**
 * Puts together what the app carries of the agent, in src-tauri/agent-bundle/,
 * which `npm run app:build` copies to Contents/Resources/agent/ (see
 * src-tauri/tauri.bundle.conf.json and find_script in src-tauri/src/agent.rs).
 *
 *   node scripts/stage-agent.mjs
 *
 * The agent is the shared EDUKORS AI library (@edukors/ai-cli): the bundle is a
 * node_modules with it and everything it imports (the Claude Agent SDK, the MCP
 * SDK, zod), resolved from each package's real location, so that a library
 * linked from a folder brings its own dependencies at the versions it was
 * tested with. Of each package, only what it publishes is copied.
 *
 * No provider's own program is here. Claude Code and Codex are the person's
 * own install (hundreds of megabytes each, per platform), which the library
 * finds on the machine and never ships. The Claude Agent SDK comes without the
 * native `claude` packages it lists as optional: the library points it at the
 * person's `claude`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src-tauri", "agent-bundle");
const LIBRARY = "@edukors/ai-cli";
const SDK = "@anthropic-ai/claude-agent-sdk";
/** What must be where the bundle looks for it once staged. */
const CHECKS = [`${LIBRARY}/dist/host/main.js`, SDK, "@modelcontextprotocol/sdk/client/stdio.js", "@modelcontextprotocol/sdk/server/streamableHttp.js", "zod"];
const manifest = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

/** Where Node would find `name` when it is imported from the real folder `from`. */
function resolvePackage(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) break;
  }
  throw new Error(`${name} (needed by ${relative(ROOT, from) || "the app"}) is not installed; run npm install`);
}

/** The packages the library needs, dependencies and peers, each once: name → real folder. */
function closure() {
  const found = new Map();
  const visit = (name, from) => {
    const dir = resolvePackage(name, from);
    if (found.has(name)) return;
    found.set(name, dir);
    const pkg = manifest(dir);
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      const optionalPeer = pkg.peerDependenciesMeta?.[dep]?.optional && !pkg.dependencies?.[dep];
      if (optionalPeer) {
        try {
          resolvePackage(dep, dir);
        } catch {
          continue;
        }
      }
      visit(dep, dir);
    }
  };
  visit(LIBRARY, ROOT);
  return found;
}

/**
 * What to copy of a package. The library, linked from its own folder, holds its
 * sources and tests too: only its `files` go (plain paths). Installed packages
 * hold what they published already; only a nested node_modules stays out.
 */
function publishes(name, dir) {
  const files = name === LIBRARY ? manifest(dir).files : null;
  const extra = ["package.json", "README.md", "LICENSE", "LICENSE.md"];
  return (src) => {
    const rel = relative(dir, src).replaceAll("\\", "/");
    if (!rel) return true;
    if (rel === "node_modules" || rel.startsWith("node_modules/")) return false;
    if (!files) return true;
    return extra.includes(rel) || files.some((f) => rel === f || rel.startsWith(f + "/") || f.startsWith(rel + "/"));
  };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const packages = closure();
for (const [name, dir] of packages) {
  // A native `claude`, listed by the SDK as optional, would only add weight.
  if (name.startsWith(`${SDK}-`)) continue;
  cpSync(dir, join(OUT, "node_modules", name), { recursive: true, dereference: true, filter: publishes(name, dir) });
}

const fromBundle = createRequire(join(OUT, "node_modules", LIBRARY, "package.json"));
for (const entry of CHECKS) {
  const path = entry.startsWith(`${LIBRARY}/`) ? join(OUT, "node_modules", entry) : null;
  try {
    if (path) {
      if (!existsSync(path)) throw new Error();
    } else fromBundle.resolve(entry);
  } catch {
    throw new Error(`${entry} is missing from the staged agent`);
  }
}

const library = manifest(packages.get(LIBRARY)).version;
const sdk = manifest(packages.get(SDK)).version;
console.log(`agent staged in ${relative(ROOT, OUT)}/: ${packages.size} packages (${LIBRARY} ${library}, SDK ${sdk})`);
