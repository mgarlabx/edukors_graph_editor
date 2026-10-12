#!/usr/bin/env node
/**
 * Prints the notes of one version, from its section of CHANGELOG.md ("## 2.12.0",
 * up to the next "## "): what the release on GitHub says, and what the app shows
 * when it offers the update (the latest.json is written by the build, with these).
 *
 *   node scripts/release-notes.mjs 2.12.0
 *
 * Fails when the section is missing or empty, so that no release goes out
 * without its notes (.github/workflows/release.yml).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!version) {
  console.error("usage: node scripts/release-notes.mjs <version>");
  process.exit(2);
}

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "CHANGELOG.md");
const lines = readFileSync(file, "utf8").split(/\r?\n/);
// "## 2.12.0", "## v2.12.0" or "## 2.12.0 — 2026-10-20".
const start = lines.findIndex((line) => /^##\s/.test(line) && line.slice(2).trim().split(/\s/)[0].replace(/^v/, "") === version);
if (start < 0) {
  console.error(`CHANGELOG.md has no section "## ${version}"`);
  process.exit(1);
}
const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
const notes = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
if (!notes) {
  console.error(`the section "## ${version}" of CHANGELOG.md is empty`);
  process.exit(1);
}
console.log(notes);
