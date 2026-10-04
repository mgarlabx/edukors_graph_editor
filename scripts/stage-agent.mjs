#!/usr/bin/env node
/**
 * Puts together what the app carries of the agent, in src-tauri/agent-bundle/,
 * which `npm run app:build` copies to Contents/Resources/agent/ (see
 * src-tauri/tauri.bundle.conf.json and find_script in src-tauri/src/agent.rs).
 *
 *   node scripts/stage-agent.mjs
 *
 * It holds the sidecar's own files and a node_modules with only what they
 * import: the Claude Agent SDK and zod, with everything those need, copied
 * from the project's node_modules so that the versions are the package-lock's.
 *
 * The SDK runs a native `claude` binary from a package of its own per
 * platform, and resolves it by Node's architecture. The Mac app is universal,
 * so both Mac packages go in; on Windows (x64 only) it is `claude.exe`. A
 * package npm did not install here is fetched once with `npm pack` and kept
 * in node_modules/.cache/edukors-agent/.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = join(ROOT, "node_modules");
const OUT = join(ROOT, "src-tauri", "agent-bundle");
const CACHE = join(MODULES, ".cache", "edukors-agent");
const SDK = "@anthropic-ai/claude-agent-sdk";
const FILES = ["sidecar.mjs", "tools.mjs", "extensions.mjs", "system-prompt.md"];
/** What agent/*.mjs import from outside Node. */
const ENTRIES = [SDK, "zod"];
const WINDOWS = process.platform === "win32";
const PLATFORMS = WINDOWS ? ["win32-x64"] : ["darwin-arm64", "darwin-x64"];
const binary = (platform) => (platform.startsWith("win32") ? "claude.exe" : "claude");

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

/** The SDK's native package for one platform, from node_modules or the cache. */
function stagePlatform(platform, version) {
  const name = `${SDK}-${platform}`;
  const dest = join(OUT, "node_modules", name);
  const local = join(MODULES, name);
  if (existsSync(join(local, "package.json")) && manifest(local).version === version) {
    cpSync(local, dest, { recursive: true });
  } else {
    const tarball = join(CACHE, `anthropic-ai-claude-agent-sdk-${platform}-${version}.tgz`);
    if (!existsSync(tarball)) {
      mkdirSync(CACHE, { recursive: true });
      console.log(`fetching ${name}@${version}`);
      // npm is npm.cmd on Windows, which only a shell runs.
      execFileSync("npm", ["pack", `${name}@${version}`, "--pack-destination", CACHE, "--silent"], { stdio: ["ignore", "ignore", "inherit"], shell: WINDOWS });
    }
    mkdirSync(dest, { recursive: true });
    // Windows' own tar: Git's, if first on the PATH, takes "C:" for a remote host.
    const tar = WINDOWS ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
    execFileSync(tar, ["-xzf", tarball, "-C", dest, "--strip-components=1"]);
  }
  if (!WINDOWS) chmodSync(join(dest, binary(platform)), 0o755);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const file of FILES) cpSync(join(ROOT, "agent", file), join(OUT, file));

const packages = closure();
for (const dir of packages) {
  cpSync(dir, join(OUT, "node_modules", relative(MODULES, dir)), {
    recursive: true,
    // Another platform's binary, nested by npm, would only add weight.
    filter: (src) => !relative(dir, src).replaceAll("\\", "/").includes(`${SDK}-`),
  });
}

const version = manifest(join(MODULES, SDK)).version;
for (const platform of PLATFORMS) stagePlatform(platform, version);

// What the SDK will do on each machine: find its binary from where it is.
const require = createRequire(join(OUT, "node_modules", SDK, "package.json"));
for (const platform of PLATFORMS) {
  try {
    require.resolve(`${SDK}-${platform}/${binary(platform)}`);
  } catch {
    throw new Error(`the ${platform} binary did not end up where the SDK looks for it`);
  }
}

console.log(`agent staged in ${relative(ROOT, OUT)}/: ${packages.length} packages + ${PLATFORMS.join(", ")} (SDK ${version})`);
