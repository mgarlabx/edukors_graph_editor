/**
 * The editor's stand-in for the server's bridge.js, injected into a verbatim
 * copy of course_player.html.
 *
 * bridge.js makes the server the player's host: it answers the player's model
 * call and copies its progress back. This does the same for the editor, across
 * a sandboxed iframe's postMessage:
 *
 *   1. the player's fetch to api.anthropic.com is handed to the editor, which
 *      writes the step or makes the judgement exactly as api/ai.php would;
 *   2. the player's localStorage is an in-memory one, seeded with the state the
 *      editor wants the student to start from ("voltar ao nó"), and every state
 *      the player saves is reported to the editor (path, student state);
 *   3. the player wears the editor's theme, not only the system's, on a
 *      transparent page, and without the "step completed" toast;
 *   4. the editor is told which step is on screen -- none on the cover, or an
 *      earlier one the student reviews from the journey -- so its bar names the
 *      node the player shows.
 *
 * window.claude.complete is defined to fail, so a step whose call failed shows
 * the player's own "try again" notice rather than a placeholder text.
 *
 * Keep it in step with player/public/assets/bridge.js: scripts/update-assets.mjs
 * compares the two whenever the player is updated.
 */
import { bootJson, playerTemplate } from "../app/export";
import type { Course } from "../schema/types";
import type { Prefs } from "../store/prefs";
import type { PlayerState } from "./session";

export const PREVIEW_SCOPE = "editor-preview";
export const STATE_KEY = `edukors.player.${PREVIEW_SCOPE}`;

const shimSource = (seed: PlayerState | null, theme: Prefs["theme"]) => `
(function () {
  'use strict';
  var STATE_KEY = ${JSON.stringify(STATE_KEY)};
  var parentWindow = window.parent;
  var pending = {};
  var nextId = 0;

  // -- 2. the student's state, in memory -----------------------------------
  var data = {};
  var seed = ${JSON.stringify(seed ? JSON.stringify(seed) : null)};
  if (seed !== null) { data[STATE_KEY] = seed; }
  var memory = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) {
      data[k] = String(v);
      if (k === STATE_KEY) { parentWindow.postMessage({ edukors: 'state', state: String(v) }, '*'); }
    },
    removeItem: function (k) { delete data[k]; },
    clear: function () { data = {}; },
    key: function (i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; }
  };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return memory; } }); } catch (e) {}

  // -- 1. the model --------------------------------------------------------
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('api.anthropic.com') === -1) { return nativeFetch.apply(this, arguments); }
    var id = ++nextId;
    return new Promise(function (resolve) {
      pending[id] = resolve;
      parentWindow.postMessage({ edukors: 'ai', id: id, body: String((init && init.body) || '{}') }, '*');
    });
  };
  window.addEventListener('message', function (event) {
    var m = event.data;
    if (!m || m.edukors !== 'ai-result' || !pending[m.id]) { return; }
    var resolve = pending[m.id];
    delete pending[m.id];
    resolve(new Response(JSON.stringify(m.json), { status: m.status, headers: { 'Content-Type': 'application/json' } }));
  });

  window.claude = { complete: function () { return Promise.reject(new Error('the call failed')); } };

  // -- 3. the editor's theme -----------------------------------------------
  // The player follows prefers-color-scheme; with a theme chosen in the
  // editor, its dark rules are switched on or off by hand, in its own sheet
  // and in the sandboxed frames it writes, and the editor can change it live.
  var theme = ${JSON.stringify(theme)};
  var DARK = /\\(\\s*prefers-color-scheme\\s*:\\s*dark\\s*\\)/g;
  var BOTH = /color-scheme\\s*:\\s*light\\s+dark/g;
  var force = function (text) {
    if (theme === 'system') { return text; }
    return text
      .replace(DARK, theme === 'dark' ? '(min-width:0px)' : '(prefers-color-scheme:dark) and (prefers-color-scheme:light)')
      .replace(BOTH, 'color-scheme:' + theme);
  };
  var mediaRules = [];
  var frames = new WeakMap();
  var srcdoc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
  if (srcdoc && srcdoc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
      configurable: true,
      get: srcdoc.get,
      set: function (v) { frames.set(this, String(v)); srcdoc.set.call(this, force(String(v))); }
    });
  }
  var applyTheme = function () {
    var root = document.documentElement;
    if (root) { root.style.colorScheme = theme === 'system' ? '' : theme; }
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) { meta.setAttribute('content', theme === 'system' ? 'light dark' : theme); }
    if (!mediaRules.length) {
      Array.prototype.forEach.call(document.styleSheets, function (sheet) {
        var rules;
        try { rules = sheet.cssRules; } catch (e) { return; }
        Array.prototype.forEach.call(rules, function (rule) {
          if (rule.media && /prefers-color-scheme/.test(rule.media.mediaText)) { mediaRules.push({ rule: rule, text: rule.media.mediaText }); }
        });
      });
    }
    mediaRules.forEach(function (m) { m.rule.media.mediaText = force(m.text); });
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) {
      if (frames.has(f)) { f.srcdoc = frames.get(f); }
    });
  };
  applyTheme();

  // The page, its bar and the boxes around HTML and embedded steps are
  // transparent, so the editor's background shows through; the "step
  // completed" toast is left out.
  var look = document.createElement('style');
  look.textContent = [
    'html, body.edukors-player-widget { background: transparent; }',
    '.edukors-player-bar { background: transparent; border-bottom: 0; box-shadow: none; }',
    '.edukors-player-step-sandbox, .edukors-player-step-embed { background: transparent; border: 0; }',
    '.edukors-player-toast { display: none !important; }'
  ].join(' ');
  (document.head || document.documentElement).appendChild(look);

  window.addEventListener('message', function (event) {
    var m = event.data;
    if (event.source !== parentWindow || !m || m.edukors !== 'theme') { return; }
    theme = m.theme;
    applyTheme();
  });

  // -- 4. the step on screen ------------------------------------------------
  // The journey marks the step the player shows (it is empty on the cover); an
  // earlier step, reviewed, carries its id.
  var shown;
  var report = function () {
    var active = document.querySelector('.edukors-player-journey-active');
    var screen = { cover: !active, reviewing: (active && active.getAttribute('data-step')) || null };
    var key = JSON.stringify(screen);
    if (key === shown) { return; }
    shown = key;
    parentWindow.postMessage({ edukors: 'screen', cover: screen.cover, reviewing: screen.reviewing }, '*');
  };
  var watch = function () {
    new MutationObserver(report).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    report();
  };
  if (document.body) { watch(); } else { document.addEventListener('DOMContentLoaded', watch); }
})();
`;

/** The player, with the course in its boot block and the shim before its own script. */
export function previewHtml(course: Course, opts: { seed: PlayerState | null; lang: string | null; manualJudges: boolean; theme: Prefs["theme"] }): string {
  const boot: Record<string, unknown> = { scope: PREVIEW_SCOPE };
  if (opts.lang) boot.lang = opts.lang;
  // With no key the author's panel replaces the judgement, as in the builder's copy.
  if (opts.manualJudges) boot.preview = true;
  const OPEN = '<script type="application/json" id="edukors-player-boot">';
  const start = playerTemplate.indexOf(OPEN);
  const end = playerTemplate.indexOf("</script>", start);
  const block = bootJson({ course, ...boot });
  let html = playerTemplate.slice(0, start + OPEN.length) + block + playerTemplate.slice(end);
  const shim = `<script>${shimSource(opts.seed, opts.theme).replace(/<\/script/gi, "<\\/script")}</script>`;
  // The player's own script is the first one after the boot block of the page just built:
  // `end` counts in the template, so a course shorter than its placeholder would land past it,
  // on a "<script>" inside the player's code.
  const at = html.indexOf("<script>", start + OPEN.length + block.length);
  html = html.slice(0, at) + shim + html.slice(at);
  return html;
}
