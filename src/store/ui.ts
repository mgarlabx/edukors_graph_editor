import { create } from "zustand";

export type ModalId = "prefs" | "languages" | "probe" | "help" | "about" | "content" | null;
export type HelpTab = "quick" | "full" | "terms";
export type BottomPanel = "problems" | null;

/** A long text the full-screen editor has open (a node's content or prompt): a localized field, in one of its languages. */
export interface ContentTarget {
  path: string;
  kind: "markdown" | "html" | "prompt";
  lang: string;
  /** the field's name, for the title */
  label: string;
  /** the node the text belongs to */
  node?: string;
}

interface UiState {
  modal: ModalId;
  probeNode: string | null;
  /** what the content editor ("content") edits */
  content: ContentTarget | null;
  /** the tab Help opens on */
  helpTab: HelpTab;
  bottom: BottomPanel;
  /** the AI agent, at the right end of the window, beside whatever else is open */
  agent: boolean;
  /** the inspector, at the right of the stage; hidden, the stage takes its width */
  inspector: boolean;
  /** the preview's side panel (calls, state, path, console); hidden, the player takes its width */
  previewSide: boolean;
  open(modal: ModalId, probeNode?: string): void;
  /** Opens Help on one of its tabs. */
  openHelp(tab?: HelpTab): void;
  /** Opens a text in the full-screen editor. */
  openContent(target: ContentTarget): void;
  /** The language the full-screen editor is showing, as the person changes it (the agent is told it). */
  setContentLang(lang: string): void;
  close(): void;
  toggleBottom(panel: Exclude<BottomPanel, null>): void;
  toggleAgent(open?: boolean): void;
  /** Opens or closes the panel beside the stage: the preview's on the preview, else the inspector. The agent has its own button. */
  toggleSidebar(preview?: boolean): void;
}

export const useUi = create<UiState>()((set) => ({
  modal: null,
  probeNode: null,
  content: null,
  helpTab: "quick",
  bottom: null,
  agent: false,
  inspector: false,
  previewSide: true,
  open: (modal, probeNode) => set({ modal, probeNode: probeNode ?? null, helpTab: "quick" }),
  openHelp: (tab = "quick") => set({ modal: "help", helpTab: tab }),
  openContent: (content) => set({ modal: "content", content }),
  setContentLang: (lang) => set((s) => (s.content && s.content.lang !== lang ? { content: { ...s.content, lang } } : {})),
  close: () => set({ modal: null }),
  toggleBottom: (panel) => set((s) => ({ bottom: s.bottom === panel ? null : panel })),
  toggleAgent: (open) => set((s) => ({ agent: open ?? !s.agent })),
  toggleSidebar: (preview = false) => set((s) => (preview ? { previewSide: !s.previewSide } : { inspector: !s.inspector })),
}));
