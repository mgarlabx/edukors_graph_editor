// What makes this app the Graph Editor inside Common's shell (docs/common-shell.md "App integration" in Common).
// Loaded before Common's boot.js, which reads it.
import pt from "../i18n/locales/pt.json";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import guidePt from "../../docs/teacher-guide.md?raw";
import guideEn from "../../docs/teacher-guide.en.md?raw";
import guideEs from "../../docs/teacher-guide.es.md?raw";
import termsPt from "../../docs/terms-of-use.md?raw";
import termsEn from "../../docs/terms-of-use.en.md?raw";
import termsEs from "../../docs/terms-of-use.es.md?raw";

declare const __APP_VERSION__: string;

/** Version of the terms of use: the app asks once per version (the text is that of 2.20). */
export const TERMS_VERSION = "2026-10-06";

const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const keys = (k: string) => (mac ? k : [k.includes("⌃") && "Ctrl", k.includes("⌘") && "Ctrl", k.includes("⇧") && "Shift", k.includes("⌥") && "Alt", k.replace(/[⌘⇧⌥⌃]/g, "")].filter(Boolean).join("+").replace("Ctrl+Ctrl", "Ctrl"));
const SHORTCUTS: [string, string][] = [
  ["⌘S", "file.save"], ["⇧⌘S", "file.saveAs"], ["⌘W", "tabs.close"],
  ["⌘Z / ⇧⌘Z", "help.undoRedo"], ["⌫", "help.delete"], ["⌘D", "insp.duplicate"], ["⌘C / ⌘V", "help.copyPaste"], ["⌘A", "help.selectAll"],
  ["⌘0", "canvas.fit"], ["⇧⌘L", "canvas.layout"], ["⇧⌘M", "problems.title"], ["⌘M", "tab.canvas"], ["⌘E", "tab.json"], ["⌘P", "tab.preview"], ["⇧⌘P", "tab.map-player"],
  ["Esc", "help.deselect"],
];
const tables: Record<string, Record<string, string>> = { pt, en, es };

/** The quick guide, written from the interface texts, with the shortcuts of this system. */
function quickGuide(lang: "pt" | "en" | "es") {
  const t = (key: string) => tables[lang][key] ?? tables.en[key] ?? key;
  const steps = [1, 2, 3, 4, 5, 6, 7].map((n) => `${n}. ${t(`help.step${n}`)}`).join("\n");
  const rows = SHORTCUTS.map(([k, label]) => `| \`${k.split(" / ").map(keys).join(" / ")}\` | ${t(label)} |`).join("\n");
  return `${t("help.lead")}\n\n${steps}\n\n## ${t("help.shortcuts")}\n\n| | |\n| --- | --- |\n${rows}\n`;
}

// The sidebar starts closed on every start, whatever was left open last time (Common remembers it per app).
try {
  localStorage.setItem("edukors.common.panel-open.sidebar", "0");
} catch {
  /* nothing remembered: closed by sidebarOpen */
}

(globalThis as any).EdukorsAppConfig = {
  name: "Edukors Graph Editor",
  version: __APP_VERSION__, // v.YY.MM.DD, from package.json (scripts/build.mjs)
  termsVersion: TERMS_VERSION,
  // Help in the editor's three languages; Common's other interface languages show English here.
  help: {
    quickGuide: { pt: quickGuide("pt"), en: quickGuide("en"), es: quickGuide("es") },
    fullGuide: { pt: guidePt, en: guideEn, es: guideEs },
    termsOfUse: { pt: termsPt, en: termsEn, es: termsEs },
  },
  // The left sidebar holds the inspector; it starts closed (see below) and opens with its toolbar button.
  sidebarOpen: false,
  file: {
    extension: ".egrx",
    // Exports (.egf with links, the standalone player) are the editor's own command, next to Save.
    exportFormats: [],
    // .egf (and older .json) courses open directly as courses without a file; Save always asks for an .egrx.
    importCommand: false,
    importFormats: [
      { id: "egf", extensions: [".egf"] },
      { id: "json", extensions: [".json"] },
    ],
  },
};
