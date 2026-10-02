import { create } from "zustand";

export type ModalId = "prefs" | "languages" | "probe" | "help" | null;
export type BottomPanel = "problems" | null;

interface UiState {
  modal: ModalId;
  probeNode: string | null;
  bottom: BottomPanel;
  /** the AI agent in the right side panel, in the inspector's place */
  agent: boolean;
  /** the inspector, in the right side panel; hidden, the stage takes its width */
  inspector: boolean;
  /** the preview's side panel (calls, state, path, judges); hidden, the player takes its width */
  previewSide: boolean;
  open(modal: ModalId, probeNode?: string): void;
  close(): void;
  toggleBottom(panel: Exclude<BottomPanel, null>): void;
  toggleAgent(open?: boolean): void;
  /** Opens or closes the right side panel: the agent, when it is there, else the preview's panel on the preview, else the inspector. */
  toggleSidebar(preview?: boolean): void;
}

export const useUi = create<UiState>()((set) => ({
  modal: null,
  probeNode: null,
  bottom: null,
  agent: false,
  inspector: false,
  previewSide: true,
  open: (modal, probeNode) => set({ modal, probeNode: probeNode ?? null }),
  close: () => set({ modal: null }),
  toggleBottom: (panel) => set((s) => ({ bottom: s.bottom === panel ? null : panel })),
  toggleAgent: (open) => set((s) => ({ agent: open ?? !s.agent })),
  toggleSidebar: (preview = false) =>
    set((s) => (s.agent ? { agent: false, inspector: false } : preview ? { previewSide: !s.previewSide } : { inspector: !s.inspector })),
}));
