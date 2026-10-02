/**
 * The agent panel's state: the connection, the conversation on screen and
 * its settings, the questions waiting for the person, the past conversations.
 *
 * One conversation is open at a time, as in the agent's process. Opening the
 * panel starts the process and a fresh conversation, so that the first
 * message is sent at once; a past one is reopened from the list with its
 * history read back from disk.
 */
import { create } from "zustand";
import type { AccountInfo, ModelInfo, SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { AgentError, connect, notify, onIncoming, request, type AskKind, type Incoming, type McpState, type SkillInfo } from "./client";
import { parseMcpConfig } from "./mcpConfig";
import { applyMessage, emptyTranscript, fromHistory, notice, settle, type Transcript } from "./transcript";
import { messageContext, selectionLabel } from "./context";
import { runTool } from "./editorTools";
import { usePrefs } from "../store/prefs";

export type Mode = "ask" | "auto" | "plan";
export type Effort = "auto" | "low" | "medium" | "high" | "xhigh" | "max";

export interface Ask {
  id: string;
  kind: AskKind;
  tool: string;
  input: Record<string, unknown>;
  toolUseId: string;
  reason: string | null;
  blockedPath?: string | null;
  /** asked about every time: no "always" (commands) */
  once?: boolean;
}

/** How the person answers a question from the agent. */
export type Answer =
  | { behavior: "allow"; always?: boolean; updatedInput?: Record<string, unknown>; mode?: Mode }
  | { behavior: "deny"; message?: string };

interface OpenResult {
  sessionId: string;
  resumed: boolean;
  account: AccountInfo | null;
  models: ModelInfo[];
  mcp?: McpState[];
  skills?: SkillInfo[];
}

export interface AgentState extends Transcript {
  connection: "idle" | "connecting" | "ready" | "error";
  error: { code: string; detail?: string } | null;
  account: AccountInfo | null;
  models: ModelInfo[];
  /** the person's MCP servers in the open conversation, and how they are doing */
  mcp: McpState[];
  /** the person's skills the open conversation was given */
  skills: SkillInfo[];
  sessionId: string | null;
  title: string | null;
  /** a turn is running */
  busy: boolean;
  /** the last message went out in plan mode: its answer is a plan to approve */
  planTurn: boolean;
  asks: Ask[];
  sessions: SDKSessionInfo[] | null;
  /** the course the conversation works on: the one on screen at the last message */
  docId: string | null;
  model: string;
  mode: Mode;
  effort: Effort;
  withSelection: boolean;
  /** Claude Code's /usage report for the account, as it was last read */
  usage: { text: string; at: number } | null;
  usageState: "idle" | "loading" | "error";

  /** Starts the process and opens a conversation, unless there is one. */
  ensure(): Promise<void>;
  newSession(): Promise<void>;
  resume(sessionId: string): Promise<void>;
  send(text: string): Promise<void>;
  interrupt(): void;
  answer(id: string, answer: Answer): void;
  setModel(model: string): void;
  setMode(mode: Mode): void;
  setEffort(effort: Effort): void;
  toggleSelection(): void;
  loadSessions(): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  /** Reads the account's usage windows again, unless they were read a moment ago (`force` reads them anyway). */
  loadUsage(force?: boolean): Promise<void>;
  /** After an error: try again from the start. */
  retry(): Promise<void>;
}

/** How long a usage report counts as fresh: replies close together share one. */
const USAGE_FRESH_MS = 15_000;
let usageLoading: Promise<void> | null = null;

const firstLine = (text: string) => {
  const line = text.trim().split("\n")[0];
  return line.length > 60 ? line.slice(0, 57).trimEnd() + "…" : line;
};

const errorOf = (e: unknown) =>
  e instanceof AgentError ? { code: e.code, detail: e.message !== e.code ? e.message : undefined } : { code: "failed", detail: e instanceof Error ? e.message : String(e) };

let opening: Promise<void> | null = null;

export const useAgent = create<AgentState>()((set, get) => {
  const saved = () => usePrefs.getState().agent;

  const persist = () => {
    const { model, mode, effort } = get();
    usePrefs.getState().save({ agent: { ...saved(), model, effort, mode: mode === "plan" ? "ask" : mode } });
  };

  /** Opens a conversation in the process: a new one, or `resume`. */
  const open = async (resume?: string) => {
    const { model, mode, effort } = get();
    const { instructions, mcp } = saved();
    const result = await request<OpenResult>("open", { resume, model, mode, effort, instructions, mcp: parseMcpConfig(mcp).servers }, 90_000);
    const otherAccount = result.account?.email !== get().account?.email;
    set({
      sessionId: result.sessionId,
      account: result.account,
      models: result.models ?? [],
      mcp: result.mcp ?? [],
      skills: result.skills ?? [],
      connection: "ready",
      error: null,
      busy: false,
      asks: [],
    });
    // Another account is another set of windows: read them now.
    void get().loadUsage(otherAccount);
  };

  const start = async (resume?: string) => {
    set({ connection: "connecting", error: null });
    try {
      await connect();
      await open(resume);
    } catch (e) {
      set({ connection: "error", error: errorOf(e) });
      throw e;
    }
  };

  /** The title the agent gave the conversation, once there is one. */
  const refreshTitle = async () => {
    await get().loadSessions();
    const found = get().sessions?.find((s) => s.sessionId === get().sessionId);
    if (found?.summary) set({ title: found.customTitle || found.summary });
  };

  onIncoming((msg: Incoming) => {
    const s = get();
    switch (msg.t) {
      case "sdk": {
        if (msg.sid !== s.sessionId) return;
        const next = applyMessage(s, msg.msg);
        const type = (msg.msg as { type: string }).type;
        if (type === "result") {
          set({ ...settle(next), busy: false });
          void refreshTitle().catch(() => undefined);
          void get().loadUsage();
        } else set({ items: next.items, live: next.live, busy: type === "stream_event" || type === "assistant" ? true : s.busy });
        return;
      }
      case "ask":
        if (msg.sid === s.sessionId) set({ asks: [...s.asks, { id: msg.id, kind: msg.kind, tool: msg.tool, input: msg.input, toolUseId: msg.toolUseId, reason: msg.reason, blockedPath: msg.blockedPath, once: msg.once }] });
        else notify("answer", { id: msg.id, behavior: "deny", message: "That conversation is no longer open." });
        return;
      case "mcp":
        if (msg.sid === s.sessionId) set({ mcp: msg.servers });
        return;
      case "ask_cancel":
        set({ asks: s.asks.filter((a) => a.id !== msg.id) });
        return;
      case "tool":
        void runTool(msg.name, msg.args, get().docId).then((result) => {
          if (result.docId) set({ docId: result.docId });
          notify("tool_reply", { id: msg.id, text: result.text, isError: !!result.isError });
        });
        return;
      case "ended":
        if (msg.sid !== s.sessionId) return;
        set({ ...settle(s), busy: false, asks: [], sessionId: null, ...(msg.error ? { items: [...settle(s).items, notice("error", msg.error, "ended")] } : {}) });
        return;
      case "exit": {
        const was = s.connection;
        // A process that died starting has already said why: that stays on screen.
        set({ ...settle(s), busy: false, asks: [], sessionId: null, connection: was === "error" ? "error" : "idle" });
        if (was === "ready" && s.items.length) set({ items: [...get().items, notice("error", msg.stderr ?? "", "exited")] });
        return;
      }
    }
  });

  return {
    ...emptyTranscript(),
    connection: "idle",
    error: null,
    account: null,
    models: [],
    mcp: [],
    skills: [],
    sessionId: null,
    title: null,
    busy: false,
    planTurn: false,
    asks: [],
    sessions: null,
    docId: null,
    model: "default",
    mode: "ask",
    effort: "auto",
    withSelection: true,
    usage: null,
    usageState: "idle",

    async ensure() {
      if (get().connection === "ready" && get().sessionId) return;
      if (!opening) {
        const pref = saved();
        if (get().connection === "idle" && !get().items.length) set({ model: pref.model, mode: pref.mode, effort: pref.effort as Effort });
        // A conversation that stopped with the process comes back where it was.
        const resume = get().items.length && lastSession ? lastSession : undefined;
        opening = start(resume).finally(() => (opening = null));
      }
      return opening;
    },

    async newSession() {
      lastSession = null;
      set({ ...emptyTranscript(), title: null, busy: false, planTurn: false, asks: [] });
      if (get().connection !== "ready") return get().ensure();
      try {
        await open();
      } catch (e) {
        set({ connection: "error", error: errorOf(e) });
      }
    },

    async resume(sessionId) {
      if (sessionId === get().sessionId) return;
      try {
        if (get().connection !== "ready") {
          set({ connection: "connecting", error: null });
          await connect();
        }
        const history = await request<Parameters<typeof fromHistory>[0]>("history", { sessionId });
        await open(sessionId);
        lastSession = sessionId;
        const info = get().sessions?.find((x) => x.sessionId === sessionId);
        set({ ...fromHistory(history), title: info ? info.customTitle || info.summary : null, planTurn: false });
      } catch (e) {
        set({ connection: "error", error: errorOf(e) });
      }
    },

    async send(text) {
      const body = text.trim();
      if (!body) return;
      const context = messageContext(get().withSelection);
      const chip = get().withSelection ? selectionLabel() : null;
      const uuid = crypto.randomUUID();
      set((s) => ({
        items: [...s.items, { kind: "user", key: uuid, text: body, ...(chip ? { context: chip } : {}) }],
        busy: true,
        planTurn: s.mode === "plan",
        docId: context.docId ?? s.docId,
        title: s.title ?? firstLine(body),
      }));
      try {
        await get().ensure();
        await request("send", { text: `${context.block}\n\n${body}`, uuid });
        lastSession = get().sessionId;
      } catch (e) {
        const item = e instanceof AgentError ? notice("error", e.message !== e.code ? e.message : "", `err.${e.code}`) : notice("error", e instanceof Error ? e.message : String(e), "send");
        set((s) => ({ busy: false, items: [...s.items, item] }));
      }
    },

    interrupt() {
      if (!get().busy) return;
      notify("interrupt");
    },

    answer(id, answer) {
      notify("answer", { id, ...answer });
      set((s) => ({ asks: s.asks.filter((a) => a.id !== id) }));
      if (answer.behavior === "allow" && answer.mode) {
        set({ mode: answer.mode });
        persist();
      }
    },

    setModel(model) {
      // A model without effort levels takes none: the effort chosen for another would not apply.
      const levels = get().models.find((m) => m.value === model)?.supportedEffortLevels;
      const effort = get().models.length && !levels?.length && get().effort !== "auto" ? "auto" : null;
      set({ model, ...(effort ? { effort } : {}) });
      persist();
      if (get().sessionId) notify("set", { model, ...(effort ? { effort } : {}) });
    },

    setMode(mode) {
      set({ mode });
      persist();
      if (get().sessionId) notify("set", { mode });
    },

    setEffort(effort) {
      set({ effort });
      persist();
      if (get().sessionId) notify("set", { effort });
    },

    toggleSelection() {
      set((s) => ({ withSelection: !s.withSelection }));
    },

    async loadSessions() {
      try {
        const sessions = await request<SDKSessionInfo[]>("list");
        set({ sessions });
      } catch {
        set((s) => ({ sessions: s.sessions ?? [] }));
      }
    },

    async deleteSession(sessionId) {
      await request("delete", { sessionId });
      set((s) => ({ sessions: (s.sessions ?? []).filter((x) => x.sessionId !== sessionId) }));
      if (sessionId === get().sessionId || sessionId === lastSession) {
        lastSession = null;
        set({ ...emptyTranscript(), title: null, sessionId: null });
        await get().ensure();
      }
    },

    async loadUsage(force = false) {
      const fresh = get().usage && Date.now() - get().usage!.at < USAGE_FRESH_MS;
      if ((fresh && !force) || get().connection !== "ready") return;
      if (!usageLoading) {
        set({ usageState: "loading" });
        usageLoading = request<{ text: string; at: number }>("usage", {}, 45_000)
          .then((usage) => set({ usage, usageState: "idle" }))
          .catch(() => set({ usageState: "error" }))
          .finally(() => (usageLoading = null));
      }
      return usageLoading;
    },

    async retry() {
      set({ connection: "idle", error: null });
      await get().ensure().catch(() => undefined);
    },
  };
});

/** The conversation the person last wrote in, to come back to it if the process has to start again. */
let lastSession: string | null = null;
