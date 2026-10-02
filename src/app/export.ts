/**
 * The two standalone files the builder makes, made the same way: ports of
 * build_player.py and build_viewer.py over verbatim copies of the player and
 * the viewer in assets/.
 */
import playerTemplate from "../../assets/course_player.html?raw";
import viewerTemplate from "../../assets/course_viewer.html?raw";
import type { Course } from "../schema/types";

export { playerTemplate };

const BOOT_OPEN = '<script type="application/json" id="edukors-player-boot">';
const BOOT_CLOSE = "</script>";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const titleOf = (course: Course, fallback = "Course"): string => {
  const info = course?.info;
  const entries = Array.isArray(info?.title) ? info.title : [];
  const own = entries.find((e) => e?.lang === info?.["source-language"]);
  if (own) return own.text || "";
  return entries.find((e) => e?.text)?.text ?? fallback;
};

const retitle = (html: string, title: string) =>
  html.includes("<title>") ? html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`) : html;

/** The boot block of the player, safe inside <script type="application/json">. */
export const bootJson = (boot: Record<string, unknown>) => JSON.stringify(boot).replace(/</g, "\\u003c");

/** build_player.py: the author's copy, with the manual judgement panel. */
export const buildPlayer = (course: Course, boot: Record<string, unknown> = { preview: true }): string => {
  let html = playerTemplate;
  const start = html.indexOf(BOOT_OPEN);
  const end = html.indexOf(BOOT_CLOSE, start);
  if (start === -1 || end === -1) throw new Error("the template does not look like the course player");
  html = html.slice(0, start + BOOT_OPEN.length) + bootJson({ course, ...boot }) + html.slice(end);
  html = retitle(html, titleOf(course));
  const lang = course?.info?.["source-language"];
  if (lang) html = html.replace(/<html lang="[^"]*"/, `<html lang="${escapeHtml(lang)}"`);
  return html;
};

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

const jsLiteral = (data: unknown) =>
  JSON.stringify(data).replace(/<\//g, "<\\/").split(LS).join("\\u2028").split(PS).join("\\u2029");

/** build_viewer.py: the map. */
export const buildViewer = (course: Course): string => {
  let html = viewerTemplate;
  if (!html.includes("</body>") || !html.includes("function render(")) throw new Error("the template does not look like the course viewer");
  html = retitle(html, titleOf(course, "Course map"));
  const block = `const COURSE = ${jsLiteral(course)};\nrender(COURSE);`;
  const start = html.indexOf("const DEMO = {");
  const end = html.indexOf("render(DEMO);");
  if (start !== -1 && end > start) return html.slice(0, start) + block + html.slice(end + "render(DEMO);".length);
  const at = html.lastIndexOf("</body>");
  return html.slice(0, at) + `<script>\n${block}\n</script>\n` + html.slice(at);
};
