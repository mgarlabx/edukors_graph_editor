// The Graph Editor inside the shell of Edukors Common. Common owns the window: title bar, toolbar (file, edit, settings,
// help, panels), document tabs, Save/Open/Recent, drafts and recovery, the AI assistant, Settings, Help, terms and
// update notices. The editor owns what is inside: the map, the EGF tab, the preview, the inspector (left sidebar), the
// problems panel, the content editor, the course's languages, the judge probe and the exports.
import "@xyflow/react/dist/style.css";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { ReactFlowProvider } from "@xyflow/react";
import { courseLangs, isPreviewTab, useEditor, type Tab } from "../store/editor";
import { cycleDoc } from "../store/docs";
import { positionsOf, type Position } from "../store/layout";
import { followLanguage, usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { t, useUiLang } from "../i18n";
import { Canvas } from "../canvas/Canvas";
import { Inspector } from "../inspector/Inspector";
import { ContentEditor } from "../inspector/ContentEditor";
import { PreviewTab } from "../preview/PreviewTab";
import { ProblemsPanel } from "../validate/ProblemsPanel";
import { LanguagesModal } from "../i18n/LanguagesModal";
import { ProbeDialog } from "../judge/ProbeDialog";
import { DialogHost, isDialogOpen } from "../ui/dialogs";
import { GraphSettings } from "../prefs/GraphSettings";
import { duplicateNodes } from "../course/ops";
import { NODE_TYPES } from "../course/nodeTypes";
import { deleteSelectedNodes, deleteSelection, onCanvas, pasteClip, selectAllNodes, selectionClip, textSelected } from "../app/clipboard";
import { insertNode } from "../app/insert";
import { exportCourse } from "../app/files";
import { focusedEditor } from "../json/ref";
import { stopPresenting } from "../app/present";
import { installDocument } from "./document";
import { configureAssistant } from "./assistant";
import { commonDocOf, syncTabs, watchChanges } from "./tabs";
import type { NodeType } from "../schema/types";

const JsonTab = lazy(() => import("../json/JsonTab"));

/* eslint-disable @typescript-eslint/no-explicit-any */
const common: any = globalThis;
const svg = (name: string) => ({ __html: common.EdukorsIcons.svg(name) });
const shellButton = (command: string) => document.querySelector<HTMLElement>(`.toolbar [data-command="${command}"]`);
const editable = (el: Element | null) => !!el && (el.closest("input, textarea, select, [contenteditable=true], .monaco-editor") !== null || (el as HTMLElement).isContentEditable);
const asking = () => isDialogOpen() || useUi.getState().modal !== null || !!document.querySelector("dialog[open]");

// ---------- Places in Common's shell where the editor renders (created once) ----------
function slot(tag: string, className: string, place: (el: HTMLElement) => void) {
  const el = document.createElement(tag);
  el.className = className;
  // Common shows and hides every .document-action as documents open and close; it starts hidden (no document yet).
  if (className.includes("document-action")) el.hidden = true;
  place(el);
  return el;
}
const viewGroup = slot("div", "toolbar-group document-action graph-views", (el) => {
  const sep = document.createElement("span");
  sep.className = "separator document-action";
  sep.setAttribute("aria-hidden", "true");
  sep.hidden = true;
  document.getElementById("file-actions")!.after(sep, el);
});
const exportSlot = slot("span", "graph-contents document-action", (el) => shellButton("reveal")?.before(el) ?? document.getElementById("file-actions")!.append(el));
// After Common's edit group (undo, redo; cut, copy, paste, duplicate, delete): new node, fit the map, problems.
const nodeGroup = slot("div", "toolbar-group document-action graph-node-actions", (el) => {
  const sep = document.createElement("span");
  sep.className = "separator document-action";
  sep.setAttribute("aria-hidden", "true");
  sep.hidden = true;
  document.getElementById("edit-actions")!.after(sep, el);
});
const sidebarSlot = slot("div", "graph-sidebar", (el) => document.querySelector("#sidebar-panel .panel-inner")?.append(el));
document.getElementById("sidebar-placeholder")?.setAttribute("hidden", "");
const workspaceSlot = slot("div", "graph-workspace", (el) => document.querySelector("main.workspace")!.append(el));
const settingsSection = (() => {
  const nav = document.querySelector(".settings-nav"), body = document.querySelector(".settings-body");
  if (!nav || !body) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-nav-item";
  button.dataset.section = "graph-preview";
  button.setAttribute("aria-controls", "graph-preview-panel");
  button.innerHTML = common.EdukorsIcons.svg("graph-Key");
  const label = document.createElement("span");
  button.append(label);
  nav.append(button);
  const section = document.createElement("section");
  section.className = "graph-settings-panel";
  section.id = "graph-preview-panel";
  section.hidden = true;
  body.append(section);
  button.addEventListener("click", () => {
    for (const item of document.querySelectorAll<HTMLElement>("[data-section]")) {
      const on = item === button;
      if (on) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
      const panel = document.getElementById(item.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !on;
    }
  });
  return { label, section };
})();

// ---------- Commands: Common's toolbar and menu, and the keyboard ----------
export function command(id: string) {
  const store = useEditor.getState();
  const ui = useUi.getState();
  if (!store.course) return;
  if (id.startsWith("insert:")) {
    const type = id.slice("insert:".length) as NodeType;
    return NODE_TYPES.includes(type) ? insertNode(type) : undefined;
  }
  if (id.startsWith("map-lang:")) {
    const lang = id.slice("map-lang:".length);
    if (courseLangs(store.course).includes(lang)) store.setCanvasLang(lang);
    return;
  }
  switch (id) {
    case "export": {
      const doc = commonDocOf(store.docId!);
      return doc ? void exportCourse(store.docId!, doc) : undefined;
    }
    case "fit":
      return store.fit();
    case "layout":
      return store.requestLayout();
    case "problems":
      return ui.toggleBottom("problems");
    case "languages":
      return ui.open("languages");
    case "tab-canvas":
    case "tab-json":
    case "tab-preview":
    case "tab-map-player":
      return store.setTab(id.slice(4) as Tab);
    case "undo":
    case "redo":
      // In a text field the field's own history wins; elsewhere, the course's.
      if (document.activeElement?.closest(".monaco-editor")) return focusedEditor()?.trigger("menu", id, null);
      if (editable(document.activeElement)) return document.execCommand(id);
      return id === "undo" ? store.undo() : store.redo();
    case "select-all":
      return onCanvas() ? selectAllNodes() : undefined;
    case "cut":
    case "copy": {
      if (!onCanvas()) return;
      const text = selectionClip();
      if (!text) return;
      void navigator.clipboard.writeText(text);
      if (id === "cut") deleteSelectedNodes("cut");
      return;
    }
    case "paste":
      return void navigator.clipboard.readText().then((text) => pasteClip(text));
    case "duplicate": {
      if (!store.selection.nodes.length || asking() || editable(document.activeElement)) return;
      let map: Record<string, string> = {};
      store.update((c) => (map = duplicateNodes(c, store.selection.nodes)), "duplicate");
      const positions = positionsOf(useEditor.getState().course);
      const moves: Record<string, Position> = {};
      for (const [from, to] of Object.entries(map)) if (positions[from]) moves[to] = { x: positions[from].x + 40, y: positions[from].y + 40 };
      useEditor.getState().setPositions(moves);
      return store.select({ nodes: Object.values(map), edge: null });
    }
    case "delete":
      if (!onCanvas() || asking() || editable(document.activeElement)) return;
      return deleteSelection();
  }
}

for (const key of ["undo", "redo", "cut", "copy", "paste", "duplicate", "delete"]) {
  const button = shellButton(key);
  button?.addEventListener("mousedown", (e) => e.preventDefault());
  button?.addEventListener("click", () => command(key));
}

/** Common's edit buttons start unavailable; the editor makes them available as the course on screen allows. */
function editState() {
  const s = useEditor.getState();
  const onMap = !!s.course && s.tab === "canvas";
  const selected = onMap && (s.selection.nodes.length > 0 || s.selection.edge !== null);
  const nodes = onMap && s.selection.nodes.length > 0;
  const on: Record<string, boolean> = { undo: !!s.course && s.past.length > 0, redo: !!s.course && s.future.length > 0, cut: nodes, copy: nodes, paste: onMap, duplicate: nodes, delete: selected };
  for (const [key, available] of Object.entries(on)) {
    const button = shellButton(key);
    if (!button) continue;
    if (available) button.removeAttribute("aria-disabled");
    else button.setAttribute("aria-disabled", "true");
  }
}
useEditor.subscribe(editState);
document.addEventListener("graph:command", ((e: CustomEvent) => command(String(e.detail))) as EventListener);

function onKey(e: KeyboardEvent) {
  const meta = e.metaKey || e.ctrlKey;
  const store = useEditor.getState();
  if (e.key === "Escape" && useUi.getState().presenting) {
    e.preventDefault();
    void stopPresenting();
    return;
  }
  if (!store.course || asking()) return;
  if (e.ctrlKey && e.key === "Tab") {
    e.preventDefault();
    cycleDoc(e.shiftKey ? -1 : 1);
    return;
  }
  if (meta) {
    const map: Record<string, string> = { d: "duplicate", 0: "fit", m: "tab-canvas", e: "tab-json", p: "tab-preview" };
    const shifted: Record<string, string> = { l: "layout", m: "problems", p: "tab-map-player" };
    const k = e.key.toLowerCase();
    const id = (e.shiftKey && !e.altKey && shifted[k]) || (!e.shiftKey && !e.altKey && map[k]);
    if (id && !(editable(document.activeElement) && k === "d")) {
      e.preventDefault();
      command(id);
      return;
    }
  }
  if (store.tab !== "canvas" || editable(document.activeElement)) return;
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    deleteSelection();
  } else if (e.key === "Escape") store.select({ nodes: [], edge: null });
}
window.addEventListener("keydown", onKey);
// Cutting, copying and pasting nodes through the system clipboard, as before.
const onCopy = (e: ClipboardEvent) => {
  if (editable(document.activeElement) || !onCanvas() || asking() || textSelected(window.getSelection())) return;
  const text = selectionClip();
  if (!text) return;
  e.clipboardData?.setData("text/plain", text);
  e.preventDefault();
  if (e.type === "cut") deleteSelectedNodes("cut");
};
document.addEventListener("copy", onCopy);
document.addEventListener("cut", onCopy);
document.addEventListener("paste", (e) => {
  if (editable(document.activeElement) || !onCanvas() || asking()) return;
  if (pasteClip(e.clipboardData?.getData("text/plain") ?? "")) e.preventDefault();
});

// ---------- Interface ----------
function Tool({ icon, label, keys, pressed, onClick }: { icon: string; label: string; keys?: string; pressed?: boolean; onClick: (button: HTMLButtonElement) => void }) {
  return (
    <button type="button" className="tool" aria-label={label} aria-pressed={pressed} onMouseDown={(e) => e.preventDefault()} onClick={(e) => onClick(e.currentTarget)}>
      <span className="graph-contents" dangerouslySetInnerHTML={svg(icon)} />
      <span className="tooltip" aria-hidden="true">
        {keys ? `${label} (${keys})` : label}
      </span>
    </button>
  );
}

function Menu({ icon, label, items }: { icon: string; label: string; items: ({ label: string; run: () => void } | null)[] }) {
  return (
    <Tool
      icon={icon}
      label={label}
      onClick={(button) => {
        const box = button.getBoundingClientRect();
        common.EdukorsContextMenu.open({ x: box.left, y: box.bottom + 4, label, restoreFocus: button, items: items.map((item) => (item ? { label: item.label, action: item.run } : { separator: true })) });
      }}
    />
  );
}

const VIEWS: [Tab, string, string][] = [
  ["canvas", "graph-Map", "tab.canvas"],
  ["json", "graph-Json", "tab.json"],
  ["preview", "graph-Preview", "tab.preview"],
  ["map-player", "graph-MapPlayer", "tab.map-player"],
];

function Toolbar() {
  const tab = useEditor((s) => s.tab);
  const course = useEditor((s) => s.course);
  const bottom = useUi((s) => s.bottom);
  if (!course) return null;
  return (
    <>
      {createPortal(<Tool icon="slides-export" label={t("export.title")} onClick={() => command("export")} />, exportSlot)}
      {createPortal(
        <>
          {VIEWS.map(([id, icon, label]) => (
            <Tool key={id} icon={icon} label={t(label)} pressed={tab === id} onClick={() => command(`tab-${id}`)} />
          ))}
        </>,
        viewGroup,
      )}
      {createPortal(
        <>
          <Menu icon="graph-Plus" label={t("insert.button")} items={NODE_TYPES.flatMap((type, i) => [...(i === 4 || i === 7 ? [null] : []), { label: t(`type.${type}`), run: () => command(`insert:${type}`) }])} />
          <Tool icon="graph-Target" label={t("canvas.fit")} onClick={() => command("fit")} />
          <Tool icon="graph-Warning" label={t("problems.title")} pressed={bottom === "problems"} onClick={() => command("problems")} />
        </>,
        nodeGroup,
      )}
    </>
  );
}

/** The course on screen: stage and the problems panel below; each tab mounted fresh when it comes on screen. */
function Workspace() {
  const tab = useEditor((s) => s.tab);
  const bottom = useUi((s) => s.bottom);
  const [previewMounted, setPreviewMounted] = useState(isPreviewTab(tab));
  const stage = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isPreviewTab(tab)) setPreviewMounted(true);
  }, [tab]);
  // The map is framed again once its area settles (Common's side panels open and resize after the course arrives),
  // and after any later change of that area's size until the person moves the map themselves.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let timer = 0, last = "";
    const observer = new ResizeObserver(() => {
      const size = `${Math.round(el.clientWidth / 40)}x${Math.round(el.clientHeight / 40)}`;
      if (size === last) return;
      last = size;
      clearTimeout(timer);
      timer = window.setTimeout(() => useEditor.getState().tab === "canvas" && useEditor.getState().fit(), 150);
    });
    observer.observe(el);
    const stop = () => observer.disconnect();
    el.addEventListener("pointerdown", stop, { once: true });
    el.addEventListener("wheel", stop, { once: true, passive: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  return (
    <div className="graph-stage-area">
      <main className="stage" ref={stage}>
        {tab === "canvas" && <Canvas />}
        {tab === "json" && (
          <Suspense fallback={<div className="pad muted">…</div>}>
            <JsonTab />
          </Suspense>
        )}
        {previewMounted && (
          <div className={isPreviewTab(tab) ? "fill" : "hidden"}>
            <PreviewTab withMap={tab === "map-player"} />
          </div>
        )}
      </main>
      {bottom === "problems" && <ProblemsPanel />}
    </div>
  );
}

function Portal({ to, children }: { to: HTMLElement | null | undefined; children: ReactNode }) {
  return to ? createPortal(children, to) : null;
}

function GraphApp() {
  useUiLang();
  const docId = useEditor((s) => s.docId);
  const modal = useUi((s) => s.modal);
  useEffect(() => {
    if (settingsSection) settingsSection.label.textContent = t("prefs.previewAi");
    const title = document.getElementById("sidebar-title");
    if (title) title.textContent = t("insp.panel");
  });
  useEffect(() => {
    workspaceSlot.hidden = !docId;
    document.querySelector("main.workspace")?.classList.toggle("graph-open", !!docId);
  }, [docId]);
  return (
    <ReactFlowProvider key={docId ?? "none"}>
      <Toolbar />
      {docId && createPortal(<Workspace />, workspaceSlot)}
      <Portal to={sidebarSlot}>{docId ? <Inspector /> : null}</Portal>
      {settingsSection && createPortal(<GraphSettings />, settingsSection.section)}
      {docId && modal === "languages" && <LanguagesModal />}
      {docId && modal === "probe" && <ProbeDialog />}
      {docId && modal === "content" && createPortal(<ContentEditor />, workspaceSlot)}
      <DialogHost />
    </ReactFlowProvider>
  );
}

// The editor's own requests for Settings and Help open Common's: Settings on the editor's section (Preview with AI).
useUi.subscribe((state, prev) => {
  if (state.modal === prev.modal) return;
  if (state.modal === "prefs") {
    useUi.getState().close();
    shellButton("settings")?.click();
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-section="graph-preview"]')?.click());
  } else if (state.modal === "help" || state.modal === "about") {
    useUi.getState().close();
    shellButton("help")?.click();
  }
});

// The interface choices of 2.20 (language, theme, assistant width), applied once through Common's own Settings.
async function applySeed() {
  await usePrefs.getState().load();
  const seed = usePrefs.getState().seed;
  if (!seed) return;
  let saved = false;
  try { saved = !!localStorage.getItem("edukors.common.preferences"); } catch { /* none */ }
  if (!saved) {
    const select = document.getElementById("language") as HTMLSelectElement | null;
    if (select && seed.language && [...select.options].some((o) => o.value === seed.language)) {
      select.value = seed.language;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (seed.theme) document.querySelector<HTMLElement>(`[data-theme-option="${seed.theme}"]`)?.click();
    try {
      if (seed.assistantWidth) localStorage.setItem("edukors.common.panel-width.assistant", String(seed.assistantWidth));
    } catch { /* kept for this session only */ }
  }
  await usePrefs.getState().dropSeed();
}

// ---------- Start ----------
installDocument();
configureAssistant();
followLanguage();
void applySeed();
watchChanges();
document.addEventListener("edukors:documents-changed", () => {
  syncTabs();
  editState();
});
syncTabs();
const root = document.createElement("div");
root.className = "graph-root";
document.body.append(root);
createRoot(root).render(<GraphApp />);
