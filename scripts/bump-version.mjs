#!/usr/bin/env node
/**
 * Sets the editor's version everywhere it is written: package.json and
 * package-lock.json, src-tauri/tauri.conf.json (what the app and the updater
 * read), src-tauri/Cargo.toml and Cargo.lock. The release workflow refuses a
 * tag that does not match all of them (.github/workflows/release.yml).
 *
 *   node scripts/bump-version.mjs 2.12.0
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: node scripts/bump-version.mjs <major.minor.patch>");
  process.exit(2);
}

/** Replaces one match of `pattern` in a file, or fails saying which. */
function replaceIn(path, pattern, replacement) {
  const file = join(ROOT, path);
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) throw new Error(`${path}: the version was not found`);
  writeFileSync(file, text.replace(pattern, replacement));
}

replaceIn("package.json", /^(  "version": )"[^"]*"/m, `$1"${version}"`);
// The lock's own version, and the root package's, which npm keeps in step.
replaceIn("package-lock.json", /^(  "version": )"[^"]*"/m, `$1"${version}"`);
replaceIn("package-lock.json", /("packages": \{\s*"": \{\s*"name": "[^"]*",\s*"version": )"[^"]*"/, `$1"${version}"`);
replaceIn("src-tauri/tauri.conf.json", /^(  "version": )"[^"]*"/m, `$1"${version}"`);
replaceIn("src-tauri/Cargo.toml", /^(\[package\][^[]*?\nversion = )"[^"]*"/m, `$1"${version}"`);
replaceIn("src-tauri/Cargo.lock", /(\nname = "edukors-editor"\nversion = )"[^"]*"/, `$1"${version}"`);

const changelog = join(ROOT, "CHANGELOG.md");
const noted = existsSync(changelog) && readFileSync(changelog, "utf8").split(/\r?\n/).some((line) => /^##\s/.test(line) && line.slice(2).trim().split(/\s/)[0].replace(/^v/, "") === version);
console.log(`version ${version} set`);
if (!noted) console.log(`CHANGELOG.md has no "## ${version}" yet: the release needs one`);
