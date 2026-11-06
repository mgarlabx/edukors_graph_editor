/**
 * Conversations kept by versions 2.19-2.20 (their panel's transcript) in the form of Common's assistant, so they show
 * in the course's history. Words of the person and of the assistant, and the tools called, carry over; the provider's
 * resume id does not (that session belonged to the old runtime: continuing one starts a new session). The whole of
 * each one also stays in the .egrx (graph/ai/legacy-conversations.json), so Common's limits drop nothing.
 */
const ID = /^[A-Za-z0-9-]{1,64}$/;

interface LegacyItem {
  kind?: string;
  text?: unknown;
  name?: unknown;
  status?: unknown;
}

export interface CommonConversation {
  format: 1;
  id: string;
  updated: string;
  accountId: string | null;
  resumeId: null;
  tokens: { input: number; output: number; cached: number; known: false };
  items: { kind: string; text?: string; tool?: string; state?: string }[];
}

/** One saved conversation of 2.19-2.20 as Common keeps conversations; null when it has nothing the person wrote. */
export function legacyToCommon(raw: unknown): CommonConversation | null {
  const c = raw as { id?: unknown; lastModified?: unknown; accountId?: unknown; items?: unknown };
  if (!c || typeof c !== "object" || typeof c.id !== "string" || !ID.test(c.id) || !Array.isArray(c.items)) return null;
  const items: CommonConversation["items"] = [];
  for (const item of c.items as LegacyItem[]) {
    if (item?.kind === "user" && typeof item.text === "string") items.push({ kind: "user", text: item.text });
    else if (item?.kind === "text" && typeof item.text === "string") items.push({ kind: "assistant", text: item.text });
    else if (item?.kind === "tool" && typeof item.name === "string") items.push({ kind: "tool", tool: item.name, state: item.status === "error" || item.status === "failed" ? "failed" : "ok" });
  }
  if (!items.some((i) => i.kind === "user")) return null;
  const when = typeof c.lastModified === "number" && Number.isFinite(c.lastModified) ? new Date(c.lastModified).toISOString() : new Date().toISOString();
  return { format: 1, id: c.id, updated: when, accountId: typeof c.accountId === "string" ? c.accountId.slice(0, 64) : null, resumeId: null, tokens: { input: 0, output: 0, cached: 0, known: false }, items };
}

/** The JSON bytes of the legacy part (an array of saved conversations), as Common's conversations, newest first. */
export function legacyConversationsOf(bytes: Uint8Array): CommonConversation[] {
  let list: unknown;
  try {
    list = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  return (Array.isArray(list) ? list : []).map(legacyToCommon).filter((c): c is CommonConversation => !!c).sort((a, b) => b.updated.localeCompare(a.updated));
}
