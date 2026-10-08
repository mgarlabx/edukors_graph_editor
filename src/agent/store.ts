/**
 * The agent panel's state: the provider it runs on, the connection, the
 * conversation on screen and its settings, the questions waiting for the
 * person, the past conversations.
 *
 * One conversation is open at a time, as in the agent's process. Opening the
 * panel starts the process and a fresh conversation, so that the first
 * message is sent at once; a past one is reopened from the list with its
 * history read back from disk. Changing provider closes what is open and
 * starts a conversation on the other one, with its own models and sessions.
 */
import { create } from "zustand";
import { AgentError, connect, notify, onIncoming, providers, request, type AskKind, type Incoming, type McpState, type SkillInfo } from "./client";
import type { AccountInfo, AgentEvent, Capabilities, ModelInfo, ProviderId, ProviderState, SessionInfo } from "./events";
import { parseMcpConfig } from "./mcpConfig";
import { applyEvent, emptyTranscript, fold, notice, settle, splitContext, type Transcript } from "./transcript";
import { messageContext, selectionLabel } from "./context";
import { runTool } from "./editorTools";
import { usePrefs } from "../store/prefs";
import { openLink } from "../app/platform";

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
  provider: ProviderId;
  account: AccountInfo | null;
  models: ModelInfo[];
  capabilities: Capabilities;
  mcp?: McpState[];
  skills?: SkillInfo[];
}

/** The events that mean the agent is at work, so the panel shows it. */
const WORKING = new Set<AgentEvent["ev"]>(["msg_start", "block_start", "block_delta", "block_stop", "assistant"]);

export interface AgentState extends Transcript {
  connection: "idle" | "connecting" | "ready" | "error";
  error: { code: string; detail?: string } | null;
  /** which provider runs the agent */
  provider: ProviderId;
  /** what that provider can do, from the open conversation */
  capabilities: Capabilities | null;
  /** which providers this machine can run, as the process reported at startup */
  available: ProviderState[];
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
  sessions: SessionInfo[] | null;
  /** the course the conversation works on: the one on screen at the last message */
  docId: string | null;
  model: string;
  mode: Mode;
  effort: Effort;
  withSelection: boolean;
  /** the account's usage windows, as the provider last reported them (Claude Code's /usage) */
  usage: { text: string; at: number } | null;
  usageState: "idle" | "loading" | "error";
  /** a sign-in was opened and the panel is waiting for it */
  signingIn: boolean;

  /** Starts the process and opens a conversation, unless there is one. */
  ensure(): Promise<void>;
  newSession(): Promise<void>;
  resume(sessionId: string): Promise<void>;
  send(text: string): Promise<void>;
  interrupt(): void;
  answer(id: string, answer: Answer): void;
  setProvider(provider: ProviderId): Promise<void>;
  setModel(model: string): void;
  setMode(mode: Mode): void;
  setEffort(effort: Effort): void;
  toggleSelection(): void;
  loadSessions(): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  /** Reads the account's usage windows again, unless they were read a moment ago (`force` reads them anyway). */
  loadUsage(force?: boolean): Promise<void>;
  /** Opens the provider's sign-in: a terminal with its CLI, or the browser. */
  login(): Promise<void>;
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

/** A session's name in the list: its title, or the start of the first message. */
export const sessionTitle = (s: SessionInfo) => s.title || (s.firstPrompt ? firstLine(splitContext(s.firstPrompt).text) : "") || s.id.slice(0, 8);

const errorOf = (e: unknown) =>
  e instanceof AgentError ? { code: e.code, detail: e.message !== e.code ? e.message : undefined } : { code: "failed", detail: e instanceof Error ? e.message : String(e) };

let opening: Promise<void> | null = null;

export const useAgent = create<AgentState>()((set, get) => {
  const saved = () => usePrefs.getState().agent;

  const persist = () => {
    const { provider, model, mode, effort } = get();
    const agent = saved();
    usePrefs.getState().save({
      agent: {
        ...agent,
        provider,
        providers: { ...agent.providers, [provider]: { model, effort } },
        // Claude's pair also stays where an older build looks for it.
        ...(provider === "claude" ? { model, effort } : {}),
        mode: mode === "plan" ? "ask" : mode,
      },
    });
  };

  /** Opens a conversation in the process: a new one, or `resume`. */
  const open = async (resume?: string) => {
    const { provider, model, mode, effort } = get();
    const { instructions, mcp } = saved();
    const result = await request<OpenResult>(
      "open",
      { provider, resume, model, mode, effort, instructions, mcp: parseMcpConfig(mcp).servers },
      120_000,
    );
    const otherAccount = result.account?.email !== get().account?.email;
    set({
      // A provider with no account yet opens no conversation: there is nothing to send to.
      sessionId: result.sessionId || null,
      account: result.account,
      capabilities: result.capabilities,
      models: result.models ?? [],
      mcp: result.mcp ?? [],
      skills: result.skills ?? [],
      connection: "ready",
      error: null,
      busy: false,
      asks: [],
      signingIn: false,
      usage: result.capabilities?.usage ? get().usage : null,
    });
    // Another account is another set of windows: read them now.
    void get().loadUsage(otherAccount);
  };

  const start = async (resume?: string) => {
    set({ connection: "connecting", error: null });
    try {
      await connect();
      set({ available: providers() });
      await open(resume);
    } catch (e) {
      set({ connection: "error", error: errorOf(e), available: providers() });
      throw e;
    }
  };

  /** The title the agent gave the conversation, once there is one. */
  const refreshTitle = async () => {
    await get().loadSessions();
    const found = get().sessions?.find((s) => s.id === get().sessionId);
    if (found?.title) set({ title: found.title });
  };

  onIncoming((msg: Incoming) => {
    const s = get();
    switch (msg.t) {
      case "ev": {
        if (msg.sid !== s.sessionId) return;
        const next = applyEvent(s, msg.ev);
        if (msg.ev.ev === "turn_end") {
          set({ ...settle(next), busy: false });
          void refreshTitle().catch(() => undefined);
          void get().loadUsage();
        } else set({ items: next.items, live: next.live, busy: WORKING.has(msg.ev.ev) ? true : s.busy });
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
      case "login":
        // The provider signed in on its own (Codex, in the browser): start over with the account it got.
        if (msg.provider === s.provider && msg.ok) void get().retry();
        else if (msg.provider === s.provider) set({ signingIn: false });
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
    provider: "claude",
    capabilities: null,
    available: [],
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
    signingIn: false,

    async ensure() {
      if (get().connection === "ready" && get().sessionId) return;
      if (!opening) {
        const pref = saved();
        if (get().connection === "idle" && !get().items.length) {
          const chosen = pref.providers[pref.provider] ?? pref.providers.claude;
          set({ provider: pref.provider, model: chosen.model, mode: pref.mode, effort: chosen.effort as Effort });
        }
        // A conversation that stopped with the process comes back where it was.
        const resume = get().items.length && lastSession ? lastSession : undefined;
        opening = start(resume).finally(() => (opening = null));
      }
      return opening;
    },

    async newSession() {
      lastSession = null;
      set({ ...emptyTranscript(), title: null, busy: false, planTurn: false, asks: [], sessionId: null });
      if (get().connection !== "ready") return get().ensure();
      // Through the same gate as ensure(), so a message written meanwhile waits
      // for this conversation instead of racing it.
      if (!opening) {
        opening = open()
          .catch((e) => set({ connection: "error", error: errorOf(e) }))
          .finally(() => (opening = null));
      }
      return opening;
    },

    async resume(sessionId) {
      if (sessionId === get().sessionId) return;
      try {
        if (get().connection !== "ready") {
          set({ connection: "connecting", error: null });
          await connect();
        }
        const events = await request<AgentEvent[]>("history", { provider: get().provider, sessionId });
        await open(sessionId);
        lastSession = sessionId;
        const info = get().sessions?.find((x) => x.id === sessionId);
        set({ ...fold(events), title: info ? sessionTitle(info) : null, planTurn: false });
      } catch (e) {
        set({ connection: "error", error: errorOf(e) });
      }
    },

    async send(text) {
      const body = text.trim();
      if (!body) return;
      const context = messageContext(get().withSelection, get().mode);
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

    async setProvider(provider) {
      if (provider === get().provider) return;
      const pref = saved();
      const chosen = pref.providers[provider] ?? { model: "default", effort: "auto" };
      lastSession = null;
      set({
        provider,
        model: chosen.model,
        effort: chosen.effort as Effort,
        ...emptyTranscript(),
        // The session belongs to the provider being left: until the other one
        // has a conversation, there is nothing to write to.
        sessionId: null,
        title: null,
        busy: false,
        planTurn: false,
        asks: [],
        sessions: null,
        account: null,
        capabilities: null,
        models: [],
        mcp: [],
        skills: [],
        usage: null,
        usageState: "idle",
        error: null,
      });
      persist();
      if (get().connection === "ready") {
        try {
          await request("close");
        } catch {
          /* it was closing anyway */
        }
      }
      await get().newSession();
    },

    setModel(model) {
      // A model without effort levels takes none: the effort chosen for another would not apply.
      const levels = get().models.find((m) => m.value === model)?.efforts;
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
        const sessions = await request<SessionInfo[]>("list", { provider: get().provider });
        set({ sessions });
      } catch {
        set((s) => ({ sessions: s.sessions ?? [] }));
      }
    },

    async deleteSession(sessionId) {
      await request("delete", { provider: get().provider, sessionId });
      set((s) => ({ sessions: (s.sessions ?? []).filter((x) => x.id !== sessionId) }));
      if (sessionId === get().sessionId || sessionId === lastSession) {
        lastSession = null;
        set({ ...emptyTranscript(), title: null, sessionId: null });
        await get().ensure();
      }
    },

    async loadUsage(force = false) {
      if (!get().capabilities?.usage) return;
      const fresh = get().usage && Date.now() - get().usage!.at < USAGE_FRESH_MS;
      if ((fresh && !force) || get().connection !== "ready") return;
      if (!usageLoading) {
        set({ usageState: "loading" });
        usageLoading = request<{ text: string; at: number }>("usage", { provider: get().provider }, 45_000)
          .then((usage) => set({ usage, usageState: "idle" }))
          .catch(() => set({ usageState: "error" }))
          .finally(() => (usageLoading = null));
      }
      return usageLoading;
    },

    async login() {
      set({ signingIn: true });
      // A sign-in nobody finished should not leave the button waiting for ever.
      clearTimeout(signInTimer);
      signInTimer = setTimeout(() => set({ signingIn: false }), 150_000);
      try {
        if (get().connection !== "ready") await connect();
        const result = await request<{ opened?: boolean; url?: string; error?: string }>("login", { provider: get().provider }, 60_000);
        // A provider that signs in through the browser hands back the page to open.
        if (result?.url) await openLink(result.url);
        // A terminal is open now, or the browser is: the person comes back and retries.
        if (get().capabilities?.login !== "browser") set({ signingIn: false });
      } catch (e) {
        set({ signingIn: false, error: errorOf(e) });
      }
    },

    async retry() {
      set({ connection: "idle", error: null, signingIn: false });
      await get().ensure().catch(() => undefined);
    },
  };
});

/** The conversation the person last wrote in, to come back to it if the process has to start again. */
let lastSession: string | null = null;
let signInTimer: ReturnType<typeof setTimeout> | undefined;
