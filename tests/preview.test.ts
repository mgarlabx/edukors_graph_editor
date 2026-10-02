/**
 * The preview page is the player with the course in its boot block and the
 * shim right before the player's own script, whatever the size of the course:
 * a course shorter than the template's placeholder once put the shim inside
 * the player's code, and the preview showed an empty page.
 */
import { describe, expect, it } from "vitest";
import { bootJson, playerTemplate } from "../src/app/export";
import { previewHtml } from "../src/preview/shim";
import { newCourse } from "../src/course/factory";
import type { Course } from "../src/schema/types";
import { loadSample, SAMPLES } from "./helpers";

const OPEN = '<script type="application/json" id="edukors-player-boot">';
const placeholder = () => {
  const start = playerTemplate.indexOf(OPEN) + OPEN.length;
  return playerTemplate.slice(start, playerTemplate.indexOf("</script>", start));
};

describe("preview page", () => {
  const short = newCourse("pt", "Curso");
  const long = loadSample(SAMPLES[2].path) as Course;

  it("covers a course shorter and one longer than the placeholder", () => {
    const boot = (course: Course) => bootJson({ course, scope: "editor-preview", preview: true });
    expect(boot(short).length).toBeLessThan(placeholder().length);
    expect(boot(long).length).toBeGreaterThan(placeholder().length);
  });

  for (const [name, course] of [["short", short], ["long", long]] as const) {
    it(`puts the shim right before the player's script, leaving the player whole (${name})`, () => {
      const html = previewHtml(course, { seed: null, lang: null, manualJudges: true, theme: "dark" });
      const shim = /<script>\n\(function \(\) \{\n  'use strict';\n  var STATE_KEY[\s\S]*?<\/script>/.exec(html);
      expect(shim).not.toBeNull();
      const bootEnd = html.indexOf("</script>", html.indexOf(OPEN));
      expect(shim!.index).toBe(html.indexOf("<script>", bootEnd));
      const withoutShim = html.slice(0, shim!.index) + html.slice(shim!.index + shim![0].length);
      const block = bootJson({ course, scope: "editor-preview", preview: true });
      expect(withoutShim).toBe(playerTemplate.replace(OPEN + placeholder(), () => OPEN + block));
    });
  }
});
