/**
 * The preview presented: the player alone, in full screen -- no toolbar, tabs,
 * preview bar or panels -- as a student would see the course. Esc, the button
 * in the corner, or leaving full screen the system's way, ends it; so does
 * leaving the preview (another tab, another course).
 */
import { useEditor } from "../store/editor";
import { useUi } from "../store/ui";
import { isTauri } from "./platform";

/** Tauri: the window's full screen has been reached since presenting began, so leaving it ends the presentation. */
let reached = false;
let watching = false;

export async function startPresenting() {
  const ui = useUi.getState();
  if (ui.presenting || useEditor.getState().tab !== "preview") return;
  watch();
  reached = false;
  ui.setPresenting(true);
  try {
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setFullscreen(true);
    } else await document.documentElement.requestFullscreen?.();
  } catch {
    // Without full screen the editor still steps aside, in the window as it is.
  }
}

export async function stopPresenting() {
  if (!useUi.getState().presenting) return;
  useUi.getState().setPresenting(false);
  try {
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (await win.isFullscreen()) await win.setFullscreen(false);
    } else if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Already out.
  }
}

/** Once, on the first presentation: what ends it from outside. */
function watch() {
  if (watching) return;
  watching = true;
  useEditor.subscribe((s, prev) => {
    if (s.tab !== "preview" || s.docId !== prev.docId) void stopPresenting();
  });
  if (isTauri()) {
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.onResized(async () => {
        if (!useUi.getState().presenting) return;
        const full = await win.isFullscreen();
        if (full) reached = true;
        else if (reached) useUi.getState().setPresenting(false);
      });
    })();
  } else {
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) useUi.getState().setPresenting(false);
    });
  }
}
