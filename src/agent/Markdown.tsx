import { useMemo, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { openLink } from "../app/platform";

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
