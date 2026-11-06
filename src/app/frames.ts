/**
 * The document of one of the editor's frames. In the desktop app it is served from graph-frame:// (src/main/index.ts),
 * so the frame does not inherit the page's strict CSP; in a browser (tests, a preview of the page) it is a srcdoc.
 */
import { useEffect, useState } from "react";
import { isDesktop, native } from "./platform";

export function useFrameDoc(html: string): { src?: string; srcDoc?: string } {
  const desktop = isDesktop();
  const [frame, setFrame] = useState<{ id: string; url: string; html: string } | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let live = true;
    void native.frame(html, frame?.id).then((f) => {
      if (live) setFrame({ ...f, html });
      else void native.frameForget(f.id);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, desktop]);
  useEffect(() => () => void (frame && native.frameForget(frame.id)), [frame]);
  if (!desktop) return { srcDoc: html };
  // Until the new document is registered, the frame keeps showing the one before (no blank flash).
  return frame ? { src: frame.url } : { src: "about:blank" };
}
