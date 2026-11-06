/**
 * The preview presented: the player alone, in full screen -- no toolbar, tabs,
 * preview bar or panels -- as a student would see the course. Esc, the button
 * in the corner, or leaving full screen the system's way, ends it; so does
 * leaving the preview (another tab, another course).
 *
 * The page's own full screen (the HTML Fullscreen API) is the window's in the desktop app (Electron).
 */
import { isPreviewTab, useEditor } from "../store/editor";
import { useUi } from "../store/ui";

let watching = false;

export async function startPresenting() {
  const ui = useUi.getState();
  if (ui.presenting || !isPreviewTab(useEditor.getState().tab)) return;
  watch();
  ui.setPresenting(true);
  document.documentElement.classList.add("graph-presenting");
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    // Without full screen the editor still steps aside, in the window as it is.
  }
}

export async function stopPresenting() {
  if (!useUi.getState().presenting) return;
  useUi.getState().setPresenting(false);
  document.documentElement.classList.remove("graph-presenting");
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Already out.
  }
}

/** Once, on the first presentation: what ends it from outside. */
function watch() {
  if (watching) return;
  watching = true;
  useEditor.subscribe((s, prev) => {
    if (s.tab !== prev.tab || s.docId !== prev.docId) void stopPresenting();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && useUi.getState().presenting) void stopPresenting();
  });
}
