import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The edukors_graph repository: the reference the editor is held to. */
export const GRAPH =
  process.env.EDUKORS_GRAPH ?? join(process.env.HOME ?? "", "Library/CloudStorage/Dropbox/EDUKORS/edukors_graph");

export const PLAYER_SRC = join(GRAPH, "player/src");
export const hasReference = ["ai.php", "course.php", "validate.php"].every((f) => existsSync(join(PLAYER_SRC, f)));
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

/** The errors and warnings the player's src/validate.php reports for a course. */
export const playerValidation = (course: unknown): { errors: string[]; warnings: string[] } =>
  JSON.parse(
    execFileSync("php", [join(__dirname, "php/validator.php"), PLAYER_SRC], {
      input: JSON.stringify(course),
      encoding: "utf8",
    }),
  );

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
