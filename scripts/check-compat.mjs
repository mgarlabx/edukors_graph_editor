#!/usr/bin/env node
/**
 * Fails when the build holds syntax that the oldest WebKit the app runs on cannot
 * parse. On macOS 12 that can be Safari 15, and one such regex anywhere in a module
 * leaves the whole window blank.
 *
 *   node scripts/check-compat.mjs        after `vite build` (part of `npm run build`)
 *
 * The build target (vite.config.ts) lowers what can be lowered: class static blocks
 * become plain code and a regex literal it cannot keep becomes `new RegExp(...)`,
 * which only throws if that line runs. What it reports here is what slipped past
 * that, in dist/assets/*.js, and in the inline scripts of the player and the viewer
 * (assets/), which reach the preview and the exports as text, untouched by the build:
 *
 *   - a regex literal with a lookbehind, (?<= or (?<!  (Safari 16.4)
 *   - a regex literal with the v flag                  (Safari 17)
 *   - a class static block                             (Safari 16.4)
 *   - a `using` declaration                            (not in Safari)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist", "assets");

if (!existsSync(DIST)) {
  console.error("dist/assets not found: run vite build first");
  process.exit(2);
}

/** What in a program WebKit 15 cannot parse, as [what, where] pairs. */
function offences(code) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === "StaticBlock") found.push(["class static block", node.start]);
    if (node.type === "VariableDeclaration" && node.kind.includes("using")) found.push([`\`${node.kind}\` declaration`, node.start]);
    if (node.type === "Literal" && node.regex) {
      if (/\(\?<[=!]/.test(node.regex.pattern)) found.push([`lookbehind in ${node.raw.slice(0, 80)}`, node.start]);
      if (node.regex.flags.includes("v")) found.push([`v flag in ${node.raw.slice(0, 80)}`, node.start]);
    }
    for (const key in node) if (key !== "start" && key !== "end") walk(node[key]);
  };
  walk(parseAst(code));
  return found;
}

const sources = readdirSync(DIST)
  .filter((f) => f.endsWith(".js"))
  .map((f) => [join(DIST, f), readFileSync(join(DIST, f), "utf8")]);
for (const name of ["course_player.html", "course_viewer.html"]) {
  const html = readFileSync(join(ROOT, "assets", name), "utf8");
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => sources.push([`${join(ROOT, "assets", name)} (script ${i + 1})`, m[1]]));
}

let bad = 0;
for (const [file, code] of sources) {
  for (const [what, at] of offences(code)) {
    bad++;
    console.error(`${relative(ROOT, file)} @${at}: ${what}`);
  }
}
if (bad) {
  console.error(`\n${bad} construct(s) that Safari 15 (macOS 12) cannot parse; the app would open blank there.`);
  process.exit(1);
}
console.log(`check-compat: ${sources.length} scripts parse on Safari 15.`);
