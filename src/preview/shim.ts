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
 *      node the player shows;
 *   5. what the course writes to the console, and its uncaught errors, go to
 *      the editor's Console tab; a link to a web page opens in the computer's
 *      browser. Both hold in the player and in the frames of its HTML steps,
 *      which get the same hooks and report through the player.
 *
 * window.claude.complete is defined to fail, so a step whose call failed shows
 * the player's own "try again" notice rather than a placeholder text.
 *
 * Keep it in step with player/public/assets/bridge.js: scripts/update-assets.mjs
 * compares the two whenever the player is updated.
 */
import { bootJson, playerTemplate } from "../app/export";
import { EXTERNAL_LINK } from "../app/platform";
import type { Course } from "../schema/types";
import type { Prefs } from "../store/prefs";
import type { PlayerState } from "./session";

export const PREVIEW_SCOPE = "editor-preview";
export const STATE_KEY = `edukors.player.${PREVIEW_SCOPE}`;

/**
 * Plain ES5, run in the player and in each HTML step's frame: the console and
 * the uncaught errors are reported as { edukors: 'console', level, text, at },
 * and a click on (or window.open of) a link to the web as { edukors: 'open',
 * href }, through `post`. The native console still gets every call. No
 * backquote and no "${" in here: it sits inside a template.
 */
const PAGE_HOOKS = String.raw`function (post) {
  var LIMIT = 2000, LINE = 8000;
  var EXTERNAL = /${EXTERNAL_LINK.source}/i;
  var one = function (v) {
    if (typeof v === 'string') { return v; }
    if (v === undefined) { return 'undefined'; }
    if (v === null || typeof v !== 'object' && typeof v !== 'function') { return String(v); }
    if (typeof v === 'function') { return 'function ' + (v.name || '') + '()'; }
    if (typeof v.message === 'string' && 'stack' in v) {
      var head = (v.name || 'Error') + ': ' + v.message;
      var stack = v.stack ? String(v.stack) : '';
      if (stack.indexOf(head) === 0) { stack = stack.slice(head.length).replace(/^\n/, ''); }
      return stack ? head + '\n' + stack : head;
    }
    if (typeof Node !== 'undefined' && v instanceof Node) { return '<' + String(v.nodeName).toLowerCase() + '>'; }
    try {
      var seen = [];
      var out = JSON.stringify(v, function (k, x) {
        if (typeof x === 'bigint') { return String(x); }
        if (x && typeof x === 'object') {
          if (seen.indexOf(x) !== -1) { return '[circular]'; }
          seen.push(x);
        }
        return x;
      });
      return out === undefined ? String(v) : out;
    } catch (e) {
      try { return String(v); } catch (e2) { return '[object]'; }
    }
  };
  var text = function (args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var p = one(args[i]);
      parts.push(p.length > LIMIT ? p.slice(0, LIMIT) + '…' : p);
    }
    var all = parts.join(' ');
    return all.length > LINE ? all.slice(0, LINE) + '…' : all;
  };
  var send = function (level, t) {
    try { post({ edukors: 'console', level: level, text: t, at: Date.now() }); } catch (e) {}
  };
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var native = console[level];
    console[level] = function () {
      send(level, text(arguments));
      if (native) { return native.apply(console, arguments); }
    };
  });
  window.addEventListener('error', function (e) {
    var target = e.target;
    if (target && target !== window && target.nodeType === 1) {
      send('error', 'failed to load ' + (target.src || target.href || String(target.nodeName).toLowerCase()));
      return;
    }
    var where = e.filename && !/^about:/.test(e.filename) ? ' (' + e.filename + ':' + e.lineno + ')' : e.lineno ? ' (line ' + e.lineno + ')' : '';
    send('error', (e.error ? one(e.error) : e.message || 'error') + where);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    send('error', 'Unhandled rejection: ' + one(e.reason));
  });
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) { return; }
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) { return; }
    var href = (a.getAttribute('href') || '').trim();
    if (!EXTERNAL.test(href)) { return; }
    e.preventDefault();
    post({ edukors: 'open', href: href });
  }, true);
  var nativeOpen = window.open;
  window.open = function (url) {
    var href = String(url == null ? '' : url).trim();
    if (EXTERNAL.test(href)) { post({ edukors: 'open', href: href }); return null; }
    return nativeOpen ? nativeOpen.apply(window, arguments) : null;
  };
}`;

/** The hooks for an HTML step's frame, which reports to the player (its parent). */
const STEP_HOOKS = `<script>(${PAGE_HOOKS})(function (m) { parent.postMessage(m, '*'); });</` + "script>";

const shimSource = (seed: PlayerState | null, theme: Prefs["theme"]) => `
(function () {
  'use strict';
  var STATE_KEY = ${JSON.stringify(STATE_KEY)};
  var parentWindow = window.parent;
  var pending = {};
  var nextId = 0;

  // -- 5. the console and the links ------------------------------------------
  // First, so that what goes wrong in the rest is reported too.
  (${PAGE_HOOKS})(function (m) {
    if (m.edukors === 'console') { m.frame = 'player'; m.title = null; }
    parentWindow.postMessage(m, '*');
  });

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
  // An HTML step's frame, as the player wrote it (the theme and the hooks go
  // in each time it is written, so it is kept without them).
  var frames = new WeakMap();
  var STEP_HOOKS = ${JSON.stringify(STEP_HOOKS)};
  var hooked = function (html) {
    var head = /<head[^>]*>/i.exec(html);
    return head ? html.slice(0, head.index + head[0].length) + STEP_HOOKS + html.slice(head.index + head[0].length) : STEP_HOOKS + html;
  };
  var srcdoc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
  if (srcdoc && srcdoc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
      configurable: true,
      get: srcdoc.get,
      set: function (v) { frames.set(this, String(v)); srcdoc.set.call(this, hooked(force(String(v)))); }
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
  // completed" toast is left out (hidden here, and taken away as soon as the
  // player puts it on the page, below).
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

  // What an HTML step's frame reports goes on to the editor, from the frames
  // the player wrote only, named after the step.
  window.addEventListener('message', function (event) {
    var m = event.data;
    if (event.source === parentWindow || !m || (m.edukors !== 'console' && m.edukors !== 'open')) { return; }
    var from = null;
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) {
      if (f.contentWindow === event.source && frames.has(f)) { from = f; }
    });
    if (!from) { return; }
    parentWindow.postMessage(m.edukors === 'open'
      ? { edukors: 'open', href: String(m.href) }
      : { edukors: 'console', level: String(m.level), text: String(m.text), at: m.at, frame: 'step', title: from.getAttribute('title') || null }, '*');
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
  var dropToasts = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.edukors-player-toast'), function (n) { n.remove(); });
  };
  var watch = function () {
    new MutationObserver(function () { dropToasts(); report(); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
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
