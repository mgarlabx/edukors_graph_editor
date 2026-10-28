/**
 * The conversation as the panel shows it, built from the library's events
 * (@edukors/ai-cli): the answer is written into `live` as it streams, and
 * becomes items for good when the turn ends or a tool call starts, so that
 * the text and the tool cards stay in the order they happened. The input and
 * result of the editor's own tools come from the panel, which runs them.
 *
 * Saved conversations keep the items themselves (history.ts), so reading one
 * back needs no provider.
 */
import type { AiEvent } from "@edukors/ai-cli";

export type ToolStatus = "running" | "done" | "error";

export type Item =
  | { kind: "user"; key: string; text: string; context?: string; files?: string[] }
  | { kind: "text"; key: string; text: string }
  | { kind: "thinking"; key: string; text: string }
  | { kind: "tool"; key: string; id: string; name: string; input: Record<string, unknown>; status: ToolStatus; result?: string }
  | { kind: "notice"; key: string; level: "info" | "warning" | "error"; text: string; code?: string }
  | { kind: "divider"; key: string; text: string };

export interface LiveBlock {
  index: number;
  type: "text" | "thinking" | "tool_use";
  text: string;
  name?: string;
  id?: string;
  done: boolean;
}

export interface Transcript {
  items: Item[];
  /** the answer being written, block by block */
  live: { messageId: string; blocks: LiveBlock[] } | null;
}

export const emptyTranscript = (): Transcript => ({ items: [], live: null });

const CONTEXT_RE = /^\s*<editor-context>([\s\S]*?)<\/editor-context>\s*/;

/**
 * A message as the person wrote it, without the context the editor put in
 * front, and the selection that context named, as context.ts labels it.
 */
export function splitContext(text: string): { text: string; context?: string } {
  const m = CONTEXT_RE.exec(text);
  if (!m) return { text };
  const rest = text.slice(m[0].length);
  const line = /^Selected: (.+?)\.?$/m.exec(m[1])?.[1];
  if (!line) return { text: rest };
  const edge = /^the edge \d+ \((.+)\)$/.exec(line);
  if (edge) return { text: rest, context: edge[1] };
  const nodes = line.split("; ").map((part) => /^(\S+) \([^)]*\) "(.*)"$/.exec(part));
  if (nodes.length === 1 && nodes[0]) return { text: rest, context: nodes[0][2].trim() ? `${nodes[0][1]} · ${nodes[0][2].trim()}` : nodes[0][1] };
  return { text: rest, context: nodes.map((n) => n?.[1]).filter(Boolean).join(", ") || undefined };
}

let seq = 0;
const key = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

/** A notice in the conversation: an error, a limit reached, an interruption. */
export const notice = (level: "info" | "warning" | "error", text: string, code?: string): Item => ({ kind: "notice", key: key("n"), level, text, code });

/**
 * What was being written, kept as it stands: at the end of a turn, or before a
 * tool card, so that the card comes after the words that led to it.
 */
function freeze(t: Transcript): Transcript {
  if (!t.live?.blocks.length) return { ...t, live: null };
  const kept: Item[] = t.live.blocks
    .filter((b) => b.text.trim())
    .map((b) => ({ kind: b.type === "thinking" ? "thinking" : "text", key: `${t.live!.messageId}:${b.index}`, text: b.text }) as Item);
  return { items: [...t.items, ...kept], live: null };
}

const interrupted = (t: Transcript): Transcript => {
  const last = t.items[t.items.length - 1];
  return last?.kind === "notice" && last.code === "interrupted" ? t : { ...t, items: [...t.items, notice("info", "", "interrupted")] };
};

const toolItem = (t: Transcript, callId: string, change: (it: Extract<Item, { kind: "tool" }>) => Item): Transcript => ({
  ...t,
  items: t.items.map((it) => (it.kind === "tool" && it.id === callId ? change(it) : it)),
});

/** One of the library's events, folded into the conversation. Events of other kinds leave it as it is. */
export function applyEvent(t: Transcript, ev: AiEvent): Transcript {
  switch (ev.type) {
    case "textDelta": {
      const live = t.live ?? { messageId: ev.requestId ?? key("m"), blocks: [] };
      const last = live.blocks[live.blocks.length - 1];
      const blocks = last && last.type === "text" && !last.done ? [...live.blocks.slice(0, -1), { ...last, text: last.text + ev.text }] : [...live.blocks, { index: live.blocks.length, type: "text" as const, text: ev.text, done: false }];
      return { ...t, live: { ...live, blocks } };
    }
    case "toolStarted": {
      const done = freeze(t);
      if (done.items.some((it) => it.kind === "tool" && it.id === ev.callId)) return done;
      return { ...done, items: [...done.items, { kind: "tool", key: ev.callId, id: ev.callId, name: ev.tool, input: {}, status: "running" }] };
    }
    case "toolCompleted":
      return toolItem(t, ev.callId, (it) => ({ ...it, status: ev.ok ? "done" : "error", ...(it.result === undefined && ev.errorCode ? { result: ev.errorCode } : {}) }));
    case "turnCompleted":
      return freeze(t);
    case "cancelled":
      return interrupted(freeze(t));
    case "error":
      return { ...freeze(t), items: [...freeze(t).items, notice("error", ev.error.message, ev.error.code)] };
    default:
      return t;
  }
}

/** The input of a tool call, once the panel has it (the call or the authorization carries it). */
export const setToolInput = (t: Transcript, callId: string, input: Record<string, unknown>): Transcript => toolItem(t, callId, (it) => ({ ...it, input }));

/** The result of one of the editor's tools, as the panel ran it. */
export const setToolResult = (t: Transcript, callId: string, result: string): Transcript => toolItem(t, callId, (it) => ({ ...it, result }));

/** Tool calls left waiting when a turn ends without their results: stopped. */
export const settle = (t: Transcript): Transcript => ({
  live: null,
  items: t.items.map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "error", result: it.result ?? "" } : it)),
});
