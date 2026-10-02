import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The edukors_graph repository: the reference the editor is held to. */
export const GRAPH =
  process.env.EDUKORS_GRAPH ?? join(process.env.HOME ?? "", "Library/CloudStorage/Dropbox/EDUKORS/edukors_graph");

export const VALIDATOR = join(GRAPH, "builder/skills/edukors-graph-builder/scripts/validate_course.py");
export const PLAYER_SRC = join(GRAPH, "player/src");
export const hasReference = existsSync(VALIDATOR);
export const hasPhp = (() => {
  try {
    execFileSync("php", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

export const SAMPLES = ["world-cats-1-mini", "world-cats-2-short", "world-cats-3-full"].map((slug) => ({
  slug,
  path: join(__dirname, "..", "samples", `${slug}-course.json`),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const loadSample = (path: string): any => JSON.parse(readFileSync(path, "utf8"));

const scratch = mkdtempSync(join(tmpdir(), "edukors-editor-test-"));

export const writeTemp = (name: string, data: unknown): string => {
  const path = join(scratch, name);
  writeFileSync(path, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return path;
};

/** The ERROR / WARNING lines validate_course.py prints for a course. */
export const pythonLines = (course: unknown, name = "course.json"): string[] => {
  const path = writeTemp(name, course);
  let out = "";
  try {
    out = execFileSync("python3", [VALIDATOR, path, "--quiet"], { encoding: "utf8" });
  } catch (e) {
    out = String((e as { stdout?: string }).stdout ?? "");
  }
  return out.split("\n").filter((l) => l.startsWith("ERROR") || l.startsWith("WARNING"));
};

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
