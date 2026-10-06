#!/usr/bin/env node
/**
 * Brings the editor's copies up to date with the edukors_graph repository, and
 * says which of the editor's ports to review when the code they mirror moved.
 *
 *   node scripts/update-assets.mjs            copy, record, warn
 *   node scripts/update-assets.mjs --check    only report what differs
 *
 * Copied verbatim (plan §6): the schema, the player, the viewer and the
 * samples. Not copied but watched, because the editor
 * carries a port of each and they must move together (plan §5.5, §8):
 *
 *   player/public/assets/bridge.js   → src/preview/shim.ts
 *   player/src/ai.php                → src/judge/pipeline.ts
 *   player/src/course.php            → src/course/condition.ts, src/judge/pipeline.ts
 *   Ai / JudgeView / Course in the player → src/judge/pipeline.ts, src/course/condition.ts
 *   builder/.../validate_course.py   → src/validate/rules.ts
 *
 * What was seen last time is kept in assets/VERSIONS.json.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GRAPH = process.env.EDUKORS_GRAPH ?? join(process.env.HOME ?? "", "Library/CloudStorage/Dropbox/EDUKORS/edukors_graph");
const CHECK = process.argv.includes("--check");
const RECORD = join(ROOT, "assets", "VERSIONS.json");

if (!existsSync(GRAPH)) {
  console.error(`edukors_graph not found at ${GRAPH} (set EDUKORS_GRAPH)`);
  process.exit(2);
}

const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const read = (path) => readFileSync(path, "utf8");

const builder = join(GRAPH, "builder/skills/edukors-graph-builder");
const copies = [
  [join(GRAPH, "schema/schema.json"), join(ROOT, "src/schema/schema.json")],
  [join(GRAPH, "player/assets/course_player.html"), join(ROOT, "assets/course_player.html")],
  [join(GRAPH, "player/assets/course_viewer.html"), join(ROOT, "assets/course_viewer.html")],
  ...readdirSync(join(GRAPH, "samples"))
    .filter((f) => f.endsWith("-course.json"))
    .map((f) => [join(GRAPH, "samples", f), join(ROOT, "samples", f)]),
];

/** A class of the player's one-line script, by name, up to the next top-level class. */
const playerSection = (html, name) => {
  const start = html.search(new RegExp(`class ${name}\\s*(extends \\w+)?\\s*\\{`));
  if (start === -1) return "";
  const rest = html.slice(start + 6);
  const end = rest.search(/class [A-Z]\w*\s*(extends \w+)?\s*\{|const StepViews/);
  return html.slice(start, end === -1 ? undefined : start + 6 + end);
};

const player = read(join(GRAPH, "player/assets/course_player.html"));
const watched = {
  "bridge.js": { text: read(join(GRAPH, "player/public/assets/bridge.js")), review: "src/preview/shim.ts" },
  "ai.php": { text: read(join(GRAPH, "player/src/ai.php")), review: "src/judge/pipeline.ts" },
  "course.php": { text: read(join(GRAPH, "player/src/course.php")), review: "src/course/condition.ts, src/judge/pipeline.ts (resolveStorage)" },
  "player Ai": { text: playerSection(player, "Ai"), review: "src/judge/pipeline.ts (judgementBlock, buildGeneration) and the shim's fetch interception" },
  "player JudgeView": { text: playerSection(player, "JudgeView"), review: "src/preview/shim.ts" },
  "player Course": { text: playerSection(player, "Course"), review: "src/course/condition.ts (holds)" },
  "validate_course.py": { text: read(join(builder, "scripts/validate_course.py")), review: "src/validate/rules.ts (then: npm test)" },
};

const before = existsSync(RECORD) ? JSON.parse(read(RECORD)) : { files: {}, watched: {} };
let commit = "";
try {
  commit = execFileSync("git", ["-C", GRAPH, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  /* not a git checkout */
}

let changed = 0;
console.log(`edukors_graph ${commit || "(no git)"} → ${ROOT}\n`);
console.log("Copies");
for (const [from, to] of copies) {
  const name = to.slice(ROOT.length + 1);
  const now = sha(read(from));
  const mine = existsSync(to) ? sha(read(to)) : null;
  if (now === mine) {
    console.log(`  = ${name}`);
    continue;
  }
  changed++;
  console.log(`  ${CHECK ? "~" : "→"} ${name}${mine ? "" : " (new)"}`);
  if (!CHECK) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}

console.log("\nPorts to keep in step");
const warnings = [];
for (const [name, { text, review }] of Object.entries(watched)) {
  const now = sha(text);
  const was = before.watched?.[name];
  if (!was) console.log(`  · ${name}: first record`);
  else if (was === now) console.log(`  = ${name}`);
  else {
    console.log(`  ! ${name} changed since ${before.date ?? "the last update"} — review ${review}`);
    warnings.push(name);
  }
}

// The shim must still find what it hooks into.
const bridge = watched["bridge.js"].text;
const hooks = [
  ["the player still asks api.anthropic.com", player.includes("https://api.anthropic.com/v1/messages")],
  ["judgements still travel as #edukors:<id>", player.includes("#edukors:")],
  ["the boot block is still #edukors-player-boot", player.includes('id="edukors-player-boot"')],
  ["the player still saves under edukors.player.<scope>", player.includes('"edukors.player."')],
  ["bridge.js still intercepts fetch", /window\.fetch\s*=/.test(bridge)],
];
console.log("\nHooks the shim relies on");
for (const [what, ok] of hooks) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) warnings.push(what);
}

if (!CHECK) {
  const schemaChanged = copies.some(([, to]) => to.endsWith("schema.json")) && before.files?.["src/schema/schema.json"] !== sha(read(join(ROOT, "src/schema/schema.json")));
  if (schemaChanged) {
    console.log("\nThe schema changed: regenerating src/schema/course.generated.ts");
    execFileSync("node", [join(ROOT, "scripts/gen-types.mjs")], { cwd: ROOT, stdio: "inherit" });
  }
  writeFileSync(
    RECORD,
    JSON.stringify(
      {
        date: new Date().toISOString().slice(0, 10),
        source: commit,
        files: Object.fromEntries(copies.map(([, to]) => [to.slice(ROOT.length + 1), sha(read(to))])),
        watched: Object.fromEntries(Object.entries(watched).map(([k, v]) => [k, sha(v.text)])),
      },
      null,
      2,
    ) + "\n",
  );
}

console.log(
  `\n${changed} file(s) ${CHECK ? "differ" : "updated"}, ${warnings.length} warning(s).` +
    (changed || warnings.length ? " Run `npm test` before shipping." : ""),
);
process.exit(warnings.length ? 1 : 0);
