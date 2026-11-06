// Builds the desktop app into dist/: the main process (ESM, on Common's Electron host), the editor's preload, the
// configuration page script, the editor (React, inside Common's shell) with Monaco's workers, and the page itself.
//
//   node scripts/build.mjs                  version = today's date (YY.M.D, Common's rule), written to package.json
//   node scripts/build.mjs --no-bump        keeps package.json's version (also on CI)
//   node scripts/build.mjs --version=X.Y.Z  sets another one (a second release on the same day)
import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const explicit = process.argv.find((a) => a.startsWith("--version="))?.slice(10);
if (explicit && !/^\d+\.\d+\.\d+$/.test(explicit)) throw Error("Use --version=YY.M.D");
const today = new Date(), dated = `${today.getFullYear() % 100}.${today.getMonth() + 1}.${today.getDate()}`;
pkg.version = explicit || (process.argv.includes("--no-bump") || process.env.CI ? pkg.version : dated);
const shown = "v." + pkg.version.split(".").map((n, i) => (i ? n.padStart(2, "0") : n)).join(".");

// The schema's validators, compiled ahead of time (no 'unsafe-eval' in the page's CSP).
await import("./gen-validators.mjs");
await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, "workers"), { recursive: true });

/** Vite's `?raw` imports: the file's text. */
const raw = {
  name: "raw",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: "raw" }));
    b.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({ contents: (await readFile(args.path, "utf8")).replace(/\r\n/g, "\n"), loader: "text" })); // LF on a Windows checkout too
  },
};

/** Vite's `?worker` imports (Monaco's workers): each built on its own into dist/workers/, started from there. */
const workers = new Map();
const worker = {
  name: "worker",
  setup(b) {
    b.onResolve({ filter: /\?worker$/ }, (args) => ({ path: args.path.slice(0, -7), namespace: "worker", pluginData: { resolveDir: args.resolveDir } }));
    b.onLoad({ filter: /.*/, namespace: "worker" }, async (args) => {
      const name = args.path.split("/").pop().replace(/\.js$/, "") + ".js";
      workers.set(name, { entry: args.path, resolveDir: args.pluginData.resolveDir });
      return { contents: `export default function () { return new Worker(new URL("workers/${name}", document.baseURI)); }`, loader: "js" };
    });
  },
};

/** Common's page scripts (package, conversations) are loaded by its boot.js before the editor: the editor uses those. */
const commonPageScripts = {
  name: "common-page-scripts",
  setup(b) {
    b.onResolve({ filter: /edukors-common-ux[\\/]src[\\/](package[\\/]package|ai[\\/]ui[\\/]ai-conversations)\.js$/ }, () => ({ path: "common", namespace: "common-page" }));
    b.onLoad({ filter: /.*/, namespace: "common-page" }, () => ({ contents: "", loader: "js" }));
  },
};

const define = { "process.env.NODE_ENV": '"production"', __APP_VERSION__: JSON.stringify(shown), __PACKAGE_VERSION__: JSON.stringify(pkg.version) };
const page = { bundle: true, platform: "browser", target: "chrome140", format: "iife", define, minify: true, legalComments: "none", loader: { ".ttf": "file", ".woff": "file", ".woff2": "file", ".svg": "text" }, assetNames: "assets/[name]-[hash]" };

await Promise.all([
  // ES module: Common's desktop host (external, from node_modules) finds its own files through import.meta.url.
  build({ entryPoints: [join(ROOT, "src/main/index.ts")], bundle: true, platform: "node", target: "node22", format: "esm", outfile: join(DIST, "main.mjs"), external: ["electron", "edukors-common-ux/desktop/*"], define, banner: { js: 'import {createRequire as __graphRequire} from "node:module";const require=__graphRequire(import.meta.url);' } }),
  build({ entryPoints: [join(ROOT, "src/main/preload.ts")], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: join(DIST, "preload.cjs"), external: ["electron"] }),
  build({ ...page, entryPoints: [join(ROOT, "src/common/config.ts")], outfile: join(DIST, "config.js"), plugins: [raw] }),
  build({ ...page, entryPoints: [join(ROOT, "src/common/editor.tsx")], outfile: join(DIST, "graph.js"), plugins: [raw, worker, commonPageScripts], jsx: "automatic" }),
]);
for (const [name, { entry, resolveDir }] of workers)
  await build({ ...page, stdin: { contents: `import ${JSON.stringify(entry)};`, resolveDir, loader: "js" }, outfile: join(DIST, "workers", name) });

// The editor's stylesheet inside Common's shell: its own rules, its tokens drawn from Common's, no global rules
// (Common's shell.css owns html, body and the base font).
// Line endings normalized: a Windows checkout has CRLF, and the marker would not be found.
const css = (await readFile(join(ROOT, "src/styles.css"), "utf8")).replace(/\r\n/g, "\n");
const marker = css.indexOf("code,\nkbd,\npre,\n.mono");
if (marker < 0) throw Error("src/styles.css: the start of the editor's own rules (code, kbd, pre, .mono) was not found");
const own = css.slice(marker);
const tokens = `/* Edukors Graph Editor inside Edukors Common: the editor's tokens from Common's. Built by scripts/build.mjs. */
:root {
  --bg: var(--workspace); --panel: var(--surface); --panel-2: color-mix(in srgb, var(--workspace) 60%, var(--surface));
  --border-strong: color-mix(in srgb, var(--border) 70%, #000); --muted: var(--icon);
  --accent-soft: color-mix(in srgb, var(--accent) 14%, var(--surface));
  --error: #d63939; --error-soft: #fdecec; --warning: #c77700; --warning-soft: #fff4dd; --ok: #2f9e44; --ok-soft: #e6f6ea;
  --canvas: color-mix(in srgb, var(--workspace) 50%, var(--surface));
  --shadow: 0 1px 2px rgba(20, 24, 40, 0.06), 0 4px 14px rgba(20, 24, 40, 0.06);
  --radius: 8px; --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --text: #263149;
}
:root[data-theme="dark"] { --error: #ff6b6b; --error-soft: #3a2124; --warning: #f0a83a; --warning-soft: #392d18; --ok: #51cf66; --ok-soft: #1d3324; --shadow: 0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.3); --border-strong: color-mix(in srgb, var(--border) 70%, #fff); }
/* The editor's own sizes are fixed px; Common's interface size (Settings, 80–200%) scales the form areas as a whole
   (zoom), so their texts keep their proportions. The map, the EGF tab and the preview have zooms of their own. */
.graph-root, .graph-workspace, .graph-sidebar, .graph-settings-panel { font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; color: var(--text); }
.graph-sidebar > *, .graph-root .modal, .graph-workspace .bottom-panel > *, .graph-workspace .content-editor, .graph-settings-panel > * { zoom: var(--font-scale, 1); }
.graph-workspace { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--bg); }
.graph-workspace[hidden] { display: none; }
main.workspace.graph-open { position: relative; }
main.workspace.graph-open > :not(.graph-workspace) { visibility: hidden; }
.graph-stage-area { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.graph-stage-area > .stage { flex: 1; min-height: 0; position: relative; }
.graph-sidebar { height: 100%; overflow: auto; }
.graph-sidebar .inspector { width: 100% !important; border: 0; }
.graph-contents { display: contents; }
.graph-problems-count { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.graph-presenting .app-shell > :not(.document-area) { display: none; }
.graph-settings { padding: 4px 0; }
/* The full-screen content editor covers the workspace only: Common's AI assistant stays beside the text. */
.graph-workspace .content-editor { position: absolute; z-index: 20; }
.graph-root button, .graph-workspace button, .graph-sidebar button { font: inherit; }
`;
await writeFile(join(DIST, "graph-styles.css"), tokens + own);

await writeFile(join(ROOT, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
// The page's policy: only its own scripts (the bridge lives here); the editor's frames come from graph-frame:, with
// their own documents (src/main/index.ts). Styles inline (React, Monaco); pictures from anywhere (course content).
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "media-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self'", "worker-src 'self' blob:", "frame-src graph-frame: about:", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join("; ");
// The page: the configuration, then Common's shell, which loads its own scripts and then the editor.
await writeFile(
  join(DIST, "index.html"),
  `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>Edukors Graph Editor</title><link rel="stylesheet" href="graph-styles.css"><link rel="stylesheet" href="graph.css"></head><body><script src="config.js"></script><script src="../node_modules/edukors-common-ux/src/shell/boot.js" data-app="graph.js"></script></body></html>\n`,
);
console.log(`Built the Graph Editor ${pkg.version} (${shown}) in dist/`);
