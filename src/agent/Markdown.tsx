import { useMemo, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { isTauri } from "../app/platform";

/** Opens a link in the browser: the webview itself never leaves the editor. */
async function openLink(href: string) {
  if (!/^(https?:|mailto:)/i.test(href)) return;
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
  } else window.open(href, "_blank", "noopener");
}

/** The agent's markdown, sanitized. */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: false }) as string), [text]);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    void openLink(a.getAttribute("href") ?? "");
  };
  return <div className={`agent-md ${className}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
