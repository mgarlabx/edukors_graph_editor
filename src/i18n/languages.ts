/**
 * The languages of a course (plan 5.9): adding one opens an empty entry in
 * every text a student reads; removing one takes its entries out of the whole
 * course, prompts included.
 */
import type { Course, CourseNode, Loc } from "../schema/types";
import { textFields, setText } from "./texts";

export const LANG_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

export function addLanguage(c: Course, lang: string) {
  if (!LANG_RE.test(lang) || lang === c.info["source-language"] || c.info["other-languages"].includes(lang)) return;
  c.info["other-languages"].push(lang);
  for (const f of textFields(c)) {
    if (!f.translatable || f.list.some((e) => e?.lang === lang)) continue;
    setText(c, f.path, [...f.list, { lang, text: "" }]);
  }
}

export function removeLanguage(c: Course, lang: string) {
  if (lang === c.info["source-language"]) return;
  c.info["other-languages"] = c.info["other-languages"].filter((l) => l !== lang);
  for (const f of textFields(c)) {
    if (!f.list.some((e) => e?.lang === lang)) continue;
    setText(
      c,
      f.path,
      f.list.filter((e) => e?.lang !== lang),
    );
  }
}

/** Renames a language everywhere, e.g. pt to pt-BR. */
export function renameLanguage(c: Course, from: string, to: string) {
  if (!LANG_RE.test(to) || from === to) return;
  if (c.info["source-language"] === from) c.info["source-language"] = to;
  c.info["other-languages"] = c.info["other-languages"].map((l) => (l === from ? to : l));
  for (const f of textFields(c)) if (f.list.some((e) => e?.lang === from)) setText(c, f.path, f.list.map((e) => (e?.lang === from ? { ...e, lang: to } : e)));
}

/** Makes another declared language the source: it moves to the front of every list. */
export function makeSource(c: Course, lang: string) {
  const old = c.info["source-language"];
  if (!c.info["other-languages"].includes(lang)) return;
  c.info["source-language"] = lang;
  c.info["other-languages"] = [old, ...c.info["other-languages"].filter((l) => l !== lang)];
  for (const f of textFields(c)) {
    const own = f.list.filter((e) => e?.lang === lang);
    if (own.length) setText(c, f.path, [...own, ...f.list.filter((e) => e?.lang !== lang)]);
  }
}

/**
 * Copies of nodes from a course written in `from`, made to speak a course in
 * `to` (both source first). A language `to` lacks is dropped; the source of
 * `to`, when missing, takes the text the nodes were written in, to be
 * translated in place rather than left hidden in an entry the inspector does
 * not show; the other languages get an empty entry, as when they were added.
 * Unchanged when the languages are the same.
 */
export function fitLanguages(nodes: CourseNode[], from: string[], to: string[]): CourseNode[] {
  if (!to.length || (from.length === to.length && from.every((l, i) => l === to[i]))) return nodes;
  const holder = { info: {}, nodes: structuredClone(nodes), edges: [] } as unknown as Course;
  for (const f of textFields(holder)) {
    const entry = (lang: string) => f.list.find((e) => e?.lang === lang);
    const written = entry(from[0]) ?? f.list.find((e) => typeof e?.text === "string" && e.text.trim() !== "") ?? f.list[0];
    const list: Loc = to.flatMap((lang, i) => {
      const own = entry(lang);
      if (own) return [own];
      if (i === 0) return [{ lang, text: typeof written?.text === "string" ? written.text : "" }];
      return f.translatable ? [{ lang, text: "" }] : [];
    });
    setText(holder, f.path, list);
  }
  return holder.nodes;
}

/** ISO 639-1 names, for the search box. Any valid code can still be typed. */
export const ISO_639_1: Record<string, string> = {
  af: "Afrikaans", am: "Amharic", ar: "العربية", az: "Azərbaycan", be: "Беларуская", bg: "Български", bn: "বাংলা", bs: "Bosanski",
  ca: "Català", cs: "Čeština", cy: "Cymraeg", da: "Dansk", de: "Deutsch", el: "Ελληνικά", en: "English", eo: "Esperanto",
  es: "Español", et: "Eesti", eu: "Euskara", fa: "فارسی", fi: "Suomi", fr: "Français", ga: "Gaeilge",
  gl: "Galego", gu: "ગુજરાતી", ha: "Hausa", he: "עברית", hi: "हिन्दी", hr: "Hrvatski", ht: "Kreyòl", hu: "Magyar",
  hy: "Հայերեն", id: "Bahasa Indonesia", ig: "Igbo", is: "Íslenska", it: "Italiano", ja: "日本語", jv: "Jawa", ka: "ქართული",
  kk: "Қазақ", km: "ខ្មែរ", kn: "ಕನ್ನಡ", ko: "한국어", ku: "Kurdî", ky: "Кыргызча", la: "Latina", lo: "ລາວ", lt: "Lietuvių",
  lv: "Latviešu", mg: "Malagasy", mi: "Māori", mk: "Македонски", ml: "മലയാളം", mn: "Монгол", mr: "मराठी", ms: "Melayu",
  mt: "Malti", my: "မြန်မာ", ne: "नेपाली", nl: "Nederlands", no: "Norsk", ny: "Chichewa", pa: "ਪੰਜਾਬੀ", pl: "Polski",
  ps: "پښتو", pt: "Português", qu: "Runa Simi", ro: "Română", ru: "Русский", rw: "Kinyarwanda", sd: "سنڌي", si: "සිංහල",
  sk: "Slovenčina", sl: "Slovenščina", sm: "Samoa", sn: "Shona", so: "Soomaali", sq: "Shqip", sr: "Српски", st: "Sesotho",
  su: "Sunda", sv: "Svenska", sw: "Kiswahili", ta: "தமிழ்", te: "తెలుగు", tg: "Тоҷикӣ", th: "ไทย", tk: "Türkmen", tl: "Tagalog",
  tr: "Türkçe", tt: "Татар", ug: "ئۇيغۇرچە", uk: "Українська", ur: "اردو", uz: "Oʻzbek", vi: "Tiếng Việt", xh: "isiXhosa",
  yi: "ייִדיש", yo: "Yorùbá", zh: "中文", zu: "isiZulu",
};
