/**
 * The conversations the editor keeps: what the person saw (the transcript's
 * items), the account it ran on, and the provider's own conversation id to
 * resume it. They are the editor's, in its data folder (src-tauri/src/agent.rs),
 * so the list and reading one back work the same for every provider and
 * account, and need no provider at all.
 */
import { call } from "../app/platform";
import type { SessionInfo } from "./events";
import type { Item } from "./transcript";

export interface SavedConversation {
  id: string;
  title: string;
  firstPrompt?: string;
  lastModified: number;
  accountId: string;
  providerId: string;
  /** the provider's conversation id, to resume it on the same account */
  resumeId?: string;
  /** the course the conversation worked on, by its file, when it had one */
  coursePath?: string | null;
  items: Item[];
}

type Meta = Omit<SavedConversation, "items">;

const metaOf = ({ items: _, ...meta }: SavedConversation): Meta => meta;

export async function listConversations(): Promise<SessionInfo[]> {
  const metas = await call<Meta[]>("agent_history_list");
  return metas
    .filter((m) => m && typeof m.id === "string")
    .map((m) => ({ id: m.id, title: m.title, firstPrompt: m.firstPrompt, lastModified: m.lastModified, accountId: m.accountId }))
    .sort((a, b) => b.lastModified - a.lastModified);
}

export const readConversation = (id: string) => call<SavedConversation>("agent_history_read", { id });

export const saveConversation = (conversation: SavedConversation) => call<void>("agent_history_write", { id: conversation.id, meta: metaOf(conversation), body: conversation });

export const deleteConversation = (id: string) => call<void>("agent_history_delete", { id });
