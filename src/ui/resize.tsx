/**
 * A side panel's left edge, dragged to set its width. The width shows while
 * dragging and is handed over, to be kept, when the mouse is let go.
 *
 * The edge captures the pointer, so the release reaches it wherever it
 * happens: over the preview's iframe, over Monaco, outside the window. A move
 * with no button down ends the drag too, should a release be lost anyway.
 */
import { useState } from "react";

export function useResizable(width: number, min: number, max: number, commit: (width: number) => void) {
  const [drag, setDrag] = useState<number | null>(null);

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const pointer = e.pointerId;
    const startX = e.clientX;
    const startW = width;
    let w = startW;
    let done = false;
    const move = (ev: PointerEvent) => {
      if (ev.buttons === 0) return end();
      w = Math.max(min, Math.min(max, startW + startX - ev.clientX));
      setDrag(w);
    };
    const end = () => {
      if (done) return;
      done = true;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      handle.removeEventListener("lostpointercapture", end);
      if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
      document.body.classList.remove("is-resizing");
      setDrag(null);
      if (w !== startW) commit(w);
    };
    handle.setPointerCapture(pointer);
    document.body.classList.add("is-resizing");
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", end);
  };

  const handle = <div className="side-resize" onPointerDown={start} role="separator" aria-orientation="vertical" />;
  return { width: Math.max(min, Math.min(max, drag ?? width)), handle };
}
