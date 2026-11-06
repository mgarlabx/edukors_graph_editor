/** Conversations of 2.19-2.20 as Common's assistant keeps them (src/common/legacy-conversations.ts). */
import { describe, expect, it } from "vitest";
import "edukors-common-ux/src/ai/ui/ai-conversations.js";
import { legacyConversationsOf, legacyToCommon } from "../src/common/legacy-conversations";

const C = () => (globalThis as any).EdukorsAiConversations;
const legacy = {
  id: "1258d0d8-88c7-4b98-b3cd-8305fb6db5b6", lastModified: 1793302563945, accountId: "uNysmzOrhN_B", providerId: "codex", resumeId: "01a18925",
  items: [
    { kind: "user", key: "a", text: "Crie um curso" },
    { kind: "text", key: "a:0", text: "Vou organizar o curso" },
    { kind: "tool", id: "t1", name: "read_course", input: "{}", status: "done", result: "…" },
    { kind: "tool", id: "t2", name: "edit_course", input: "{}", status: "error", result: "…" },
    { kind: "ask", text: "?" },
  ],
};

describe("conversations of 2.19-2.20", () => {
  it("become Common's: words, tools, the account; no resume of the old runtime", () => {
    const c = legacyToCommon(legacy)!;
    expect(c.items).toEqual([
      { kind: "user", text: "Crie um curso" },
      { kind: "assistant", text: "Vou organizar o curso" },
      { kind: "tool", tool: "read_course", state: "ok" },
      { kind: "tool", tool: "edit_course", state: "failed" },
    ]);
    expect(c.accountId).toBe("uNysmzOrhN_B");
    expect(c.resumeId).toBeNull();
    // Common's own reader accepts them as they are.
    expect(C().deserialize(c)?.items).toHaveLength(4);
  });

  it("leave out what has no words of the person, and come newest first", () => {
    expect(legacyToCommon({ id: "x", items: [{ kind: "text", text: "hi" }] })).toBeNull();
    const older = { ...legacy, id: "older", lastModified: 1 };
    const list = legacyConversationsOf(new TextEncoder().encode(JSON.stringify([older, legacy, { nonsense: true }])));
    expect(list.map((c) => c.id)).toEqual([legacy.id, "older"]);
    expect(legacyConversationsOf(new TextEncoder().encode("not json"))).toEqual([]);
  });
});
