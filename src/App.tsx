import { lazy, Suspense, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { courseLangs, useEditor } from "./store/editor";
import { activateNth, cycleDoc, dirtyDocs, flushPending } from "./store/docs";
import { usePrefs } from "./store/prefs";
import { useUi } from "./store/ui";
import { isTauri, native } from "./app/platform";
import { closeDoc, createCourse, exportPlayer, openCourse, saveCourse, settleAll, watchLayout, windowTitle } from "./app/files";
import { Toolbar } from "./app/Toolbar";
import { DocTabs } from "./app/DocTabs";
import { HelpModal } from "./app/HelpModal";
import { Canvas } from "./canvas/Canvas";
import { Inspector } from "./inspector/Inspector";
import { AgentPanel } from "./agent/AgentPanel";
import { jsonEditor } from "./json/ref";

const JsonTab = lazy(() => import("./json/JsonTab"));
import { PreviewTab } from "./preview/PreviewTab";
import { ProblemsPanel } from "./validate/ProblemsPanel";
import { LanguagesModal } from "./i18n/LanguagesModal";
import { PrefsDialog } from "./prefs/PrefsDialog";
import { ProbeDialog } from "./judge/ProbeDialog";
import { DialogHost, isDialogOpen } from "./ui/dialogs";
import { duplicateNodes } from "./course/ops";
import { deleteSelectedNodes, deleteSelection, onCanvas, pasteClip, selectAllNodes, selectionClip } from "./app/clipboard";
import { insertNode } from "./app/insert";
import { NODE_TYPES } from "./course/nodeTypes";
import type { NodeType } from "./schema/types";
import { useUiLang } from "./i18n";
import { syncMenu, watchMenu } from "./app/menu";

const editable = (el: Element | null) =>
  !!el && (el.closest("input, textarea, select, [contenteditable=true], .monaco-editor") !== null || (el as HTMLElement).isContentEditable);

/** What changes the course on screen for another: not while a dialog is asking about the one there. */
const SWITCHES = new Set(["new", "open", "close-tab", "next-tab", "prev-tab"]);
const asking = () => isDialogOpen() || useUi.getState().modal !== null;

/** What the menu and the keyboard can ask for. */
export function command(id: string) {
  const store = useEditor.getState();
  const ui = useUi.getState();
  if ((SWITCHES.has(id) || id.startsWith("recent:")) && asking()) return;
  if (id === "recent-clear") return usePrefs.getState().save({ recent: [] });
  if (id.startsWith("recent:")) return openCourse(id.slice("recent:".length));
  if (id.startsWith("insert:")) {
    const type = id.slice("insert:".length) as NodeType;
    return NODE_TYPES.includes(type) ? insertNode(type) : undefined;
  }
  if (id.startsWith("map-lang:")) {
    const lang = id.slice("map-lang:".length);
    if (store.course && courseLangs(store.course).includes(lang)) store.setCanvasLang(lang);
    // Clicking the checked language unchecks it in the menu; the rebuild checks it again.
    return syncMenu(true);
  }
  switch (id) {
    case "new":
      return createCourse();
    case "open":
      return openCourse();
    case "save":
      return saveCourse(false);
    case "save-as":
      return saveCourse(true);
    case "close-tab":
      return closeDoc();
    case "next-tab":
      return cycleDoc(1);
    case "prev-tab":
      return cycleDoc(-1);
    case "export-player":
      return exportPlayer();
    case "prefs":
      return ui.open("prefs");
    case "help":
      return ui.open("help");
    case "agent":
      return store.course ? ui.toggleAgent() : undefined;
    case "sidebar":
      return store.course ? ui.toggleSidebar(store.tab === "preview") : undefined;
    case "fit":
      return store.fit();
    case "layout":
      return store.requestLayout();
    case "problems":
      return store.course ? ui.toggleBottom("problems") : undefined;
    case "tab-canvas":
      return store.setTab("canvas");
    case "tab-json":
      return store.setTab("json");
    case "tab-preview":
      return store.setTab("preview");
    case "undo":
    case "redo":
      // In a text field the field's own history wins; elsewhere, the course's.
      if (document.activeElement?.closest(".monaco-editor")) return jsonEditor.current?.trigger("menu", id, null);
      if (editable(document.activeElement)) return document.execCommand(id);
      return id === "undo" ? store.undo() : store.redo();
    case "duplicate": {
      if (!store.selection.nodes.length || editable(document.activeElement)) return;
      let map: Record<string, string> = {};
      store.update((c) => (map = duplicateNodes(c, store.selection.nodes)), "duplicate");
      const positions = { ...useEditor.getState().layout.positions };
      for (const [from, to] of Object.entries(map)) if (positions[from]) positions[to] = { x: positions[from].x + 40, y: positions[from].y + 40 };
      useEditor.getState().setPositions(positions);
      return store.select({ nodes: Object.values(map), edge: null });
    }
    case "delete":
      if (!onCanvas() || asking() || editable(document.activeElement)) return;
      return deleteSelection();
  }
}

export default function App() {
  useUiLang();
  const docId = useEditor((s) => s.docId);
  const modal = useUi((s) => s.modal);
  const agent = useUi((s) => s.agent);

  // Boot: preferences, the file the system asked us to open, the menu.
  useEffect(() => {
    usePrefs.getState().load();
    const stopLayout = watchLayout();
    const cleanups: (() => void)[] = [stopLayout, watchMenu()];
    if (isTauri()) {
      (async () => {
        const { listen } = await import("@tauri-apps/api/event");
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        // Each file the system hands over opens in its own tab.
        const openPending = async () => {
          for (const file of await native.takeOpenedFiles()) await openCourse(file);
        };
        cleanups.push(await listen<string>("menu", (e) => command(e.payload)));
        cleanups.push(await listen("open-file", openPending));
        cleanups.push(
          await win.onCloseRequested(async (event) => {
            flushPending();
            if (!dirtyDocs().length) return;
            event.preventDefault();
            if (await settleAll()) await win.destroy();
          }),
        );
        let last = "";
        cleanups.push(
          useEditor.subscribe(() => {
            const title = windowTitle();
            if (title !== last) win.setTitle((last = title));
          }),
        );
        await openPending();
      })();
    }
    return () => cleanups.forEach((c) => c());
  }, []);

  // The keyboard, for what the native menu does not cover.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const store = useEditor.getState();
      // Tabs: ⌘1…⌘9 everywhere (no menu item takes them); ⌃⇥ and ⇧⌃⇥ come from the menu in the app.
      if (meta && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        if (!asking()) activateNth(Number(e.key));
        return;
      }
      if (!isTauri() && e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        command(e.shiftKey ? "prev-tab" : "next-tab");
        return;
      }
      if (!isTauri() && meta && e.altKey && e.code === "Digit0") {
        e.preventDefault();
        command("sidebar");
        return;
      }
      if (!isTauri() && meta && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        command("agent");
        return;
      }
      if (!isTauri() && meta) {
        const map: Record<string, string> = { n: "new", o: "open", s: e.shiftKey ? "save-as" : "save", z: e.shiftKey ? "redo" : "undo", d: "duplicate", 0: "fit", m: "tab-canvas", j: "tab-json", p: "tab-preview", ",": "prefs" };
        const shifted: Record<string, string> = { l: "layout", m: "problems" };
        const id = (e.shiftKey && shifted[e.key.toLowerCase()]) || map[e.key.toLowerCase()];
        if (id && !(editable(document.activeElement) && ["z", "d"].includes(e.key.toLowerCase()))) {
          e.preventDefault();
          command(id);
          return;
        }
      }
      if (!store.course || store.tab !== "canvas" || useUi.getState().modal || editable(document.activeElement)) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "Escape") store.select({ nodes: [], edge: null });
      else if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllNodes();
      }
    };
    // Cutting, copying and pasting nodes, through the system clipboard.
    const onCopy = (e: ClipboardEvent) => {
      if (editable(document.activeElement) || !onCanvas()) return;
      const text = selectionClip();
      if (!text) return;
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
      if (e.type === "cut") deleteSelectedNodes("cut");
    };
    const onPaste = (e: ClipboardEvent) => {
      if (editable(document.activeElement) || !onCanvas()) return;
      if (pasteClip(e.clipboardData?.getData("text/plain") ?? "")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        <div className="app-main">
          {docId && <DocTabs />}
          {docId ? <Workspace key={docId} /> : <div className="welcome" />}
        </div>
        {agent && docId && <AgentPanel />}
      </div>
      {modal === "prefs" && <PrefsDialog />}
      {modal === "help" && <HelpModal />}
      {docId && modal === "languages" && <LanguagesModal />}
      {docId && modal === "probe" && <ProbeDialog />}
      <DialogHost />
    </div>
  );
}

/**
 * The course on screen: stage, inspector (or, beside it all, the agent, App
 * above) and the panels below. Each
 * tab gets its own, mounted fresh when it comes on screen -- the graph at the
 * view it was left with, the preview where its student was.
 */
function Workspace() {
  const tab = useEditor((s) => s.tab);
  const bottom = useUi((s) => s.bottom);
  const agent = useUi((s) => s.agent);
  const inspector = useUi((s) => s.inspector);
  const [previewMounted, setPreviewMounted] = useState(tab === "preview");

  useEffect(() => {
    if (tab === "preview") setPreviewMounted(true);
  }, [tab]);

  return (
    <ReactFlowProvider>
      <div className="workspace">
        <main className="stage">
          {tab === "canvas" && <Canvas />}
          {tab === "json" && (
            <Suspense fallback={<div className="pad muted">…</div>}>
              <JsonTab />
            </Suspense>
          )}
          {previewMounted && (
            <div className={tab === "preview" ? "fill" : "hidden"}>
              <PreviewTab />
            </div>
          )}
        </main>
        {tab !== "preview" && !agent && inspector && <Inspector />}
      </div>
      {bottom === "problems" && <ProblemsPanel />}
    </ReactFlowProvider>
  );
}
