/**
 * The conversation as the panel shows it, built from the agent's events.
 *
 * The agent's process sends each block of an answer -- a thought, a text, a
 * tool call -- as an event of its own once it is complete, and, as it is
 * written, a stream of events with the text so far. The stream fills `live`,
 * which is shown at the end of the conversation; each complete block replaces
 * its live copy with an item for good. A conversation read back from disk goes
 * through the same steps, without the stream (`fold`).
 *
 * Which provider is behind the agent makes no difference here: the events are
 * the same for all of them (src/agent/events.ts).
 */
import type { AgentEvent, Block } from "./events";

export type ToolStatus = "running" | "done" | "error";

export type Item =
  | { kind: "user"; key: string; text: string; context?: string }
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

/** The blocks of a complete answer, as items; the live copies of those blocks go. */
function assistantBlocks(t: Transcript, uuid: string, messageId: string | undefined, blocks: Block[]): Transcript {
  const items = [...t.items];
  let live = t.live;
  for (const b of blocks) {
    if (b.type === "tool_use") {
      if (items.some((it) => it.kind === "tool" && it.id === b.id)) continue;
      items.push({ kind: "tool", key: b.id, id: b.id, name: b.name, input: b.input, status: "running" });
    } else if (b.type === "text") items.push({ kind: "text", key: `${uuid}:${b.index}`, text: b.text });
    else items.push({ kind: "thinking", key: `${uuid}:${b.index}`, text: b.text });
    if (live && live.messageId === messageId) {
      const at = live.blocks.findIndex((l) => l.type === b.type && (b.type !== "tool_use" || l.id === b.id));
      if (at !== -1) live = { ...live, blocks: live.blocks.filter((_, k) => k !== at) };
    }
  }
  return { items, live };
}

/**
 * What was being written when the turn stopped short, kept as it stood: an
 * interrupted answer has no complete message to replace its live copy.
 */
function freeze(t: Transcript): Transcript {
  if (!t.live?.blocks.length) return { ...t, live: null };
  const kept: Item[] = t.live.blocks
    .filter((b) => b.type !== "tool_use" && b.text.trim())
    .map((b) => (b.type === "text" ? { kind: "text", key: `${t.live!.messageId}:${b.index}`, text: b.text } : { kind: "thinking", key: `${t.live!.messageId}:${b.index}`, text: b.text }));
  return { items: [...t.items, ...kept], live: null };
}

const interrupted = (t: Transcript): Transcript => {
  const last = t.items[t.items.length - 1];
  return last?.kind === "notice" && last.code === "interrupted" ? t : { ...t, items: [...t.items, notice("info", "", "interrupted")] };
};

/** One event from the agent's process, folded into the conversation. */
export function applyEvent(t: Transcript, ev: AgentEvent): Transcript {
  switch (ev.ev) {
    case "msg_start":
      return { ...t, live: { messageId: ev.messageId, blocks: [] } };
    case "block_start": {
      const live = t.live ?? { messageId: "", blocks: [] };
      const block: LiveBlock = { index: ev.index, type: ev.type, text: ev.text ?? "", name: ev.name, id: ev.id, done: false };
      return { ...t, live: { ...live, blocks: [...live.blocks, block] } };
    }
    case "block_delta":
      if (!t.live) return t;
      return { ...t, live: { ...t.live, blocks: t.live.blocks.map((b) => (b.index === ev.index && !b.done ? { ...b, text: b.text + ev.text } : b)) } };
    case "block_stop":
      if (!t.live) return t;
      return { ...t, live: { ...t.live, blocks: t.live.blocks.map((b) => (b.index === ev.index ? { ...b, done: true } : b)) } };
    case "assistant":
      return assistantBlocks(t, ev.uuid, ev.messageId, ev.blocks);
    case "tool_result":
      return {
        ...t,
        items: t.items.map((it) => (it.kind === "tool" && it.id === ev.toolUseId ? { ...it, status: ev.isError ? "error" : "done", result: ev.text } : it)),
      };
    case "user": {
      const { text, context } = splitContext(ev.text);
      return { ...t, items: [...t.items, { kind: "user", key: ev.key, text, ...(context ? { context } : {}) }] };
    }
    case "interrupted":
      return interrupted(freeze(t));
    case "turn_end": {
      const done = freeze(t);
      if (ev.status === "success") return done;
      if (ev.status === "interrupted") return interrupted(done);
      return { ...done, items: [...done.items, notice("error", ev.text ?? "", ev.code)] };
    }
    case "notice":
      return { ...t, items: [...t.items, notice(ev.level, ev.text, ev.code)] };
    case "divider":
      return { ...t, items: [...t.items, { kind: "divider", key: key("d"), text: ev.text }] };
    case "reset":
      return emptyTranscript();
  }
}

/** A conversation read back from disk: its events, folded, with nothing still running. */
export function fold(events: AgentEvent[]): Transcript {
  const t = events.reduce(applyEvent, emptyTranscript());
  // A tool call with no result was cut short when the conversation stopped.
  return { items: t.items.map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "error" } : it)), live: null };
}

/** Tool calls left waiting when a turn ends without their results: stopped. */
export const settle = (t: Transcript): Transcript => ({
  live: null,
  items: t.items.map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "error", result: it.result ?? "" } : it)),
});
