/**
 * The agent panel's state, over the EDUKORS AI library (@edukors/ai-cli): the
 * account the agent runs on, the conversation on screen and its settings, the
 * questions and approvals waiting for the person, the saved conversations.
 *
 * One conversation is open at a time. It is a library session on the account
 * chosen in the preferences; the panel gives it the editor's prompt
 * (prompt.ts), the course tools (toolSpecs.ts), and the person's MCP servers
 * and skills. Each tool call comes back here: the editor's gate decides it
 * (the mode, an approval card), then editorTools.ts runs it. The transcript is
 * built from the library's events and saved by the editor (history.ts).
 */
import { create } from "zustand";
import type { AccountInfo, AccountStatus, AiEvent, Capabilities, Detection } from "@edukors/ai-cli";
import { parseMcpConfig } from "@edukors/ai-cli/settings";
import { fileName, withFiles } from "./attachments";
import { AgentError, connect, lastRequestId, request, setHandlers, type HostRequest, type LoginMessage } from "./client";
import type { ModelInfo, ProviderId, SessionInfo, UsageLimit, UsageReport } from "./events";
import { deleteConversation, listConversations, readConversation, saveConversation } from "./history";
import { systemPrompt } from "./prompt";
import { applyEvent, emptyTranscript, notice, setToolInput, setToolResult, settle, splitContext, type Transcript } from "./transcript";
import { messageContext, selectionLabel } from "./context";
import { runTool } from "./editorTools";
import { kindOf, SERVER, toolSpecs } from "./toolSpecs";
import { DEFAULT_PREFS, usePrefs } from "../store/prefs";
import { call } from "../app/platform";

export type Mode = "ask" | "auto" | "plan";
export type Effort = "auto" | "low" | "medium" | "high" | "xhigh" | "max";
export type AskKind = "permission" | "question" | "plan";

export interface Ask {
  id: string;
  kind: AskKind;
  tool: string;
  input: Record<string, unknown>;
  toolUseId: string;
  reason: string | null;
  blockedPath?: string | null;
  /** asked about every time: no "always" */
  once?: boolean;
}

/** How the person answers a question from the agent. */
export type Answer =
  | { behavior: "allow"; always?: boolean; updatedInput?: Record<string, unknown>; mode?: Mode }
  | { behavior: "deny"; message?: string };

/** One of the person's MCP servers in the open conversation. */
export interface McpState {
  name: string;
  status: "connected" | "failed" | "pending";
  error?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  folder: string;
}

/** A sign-in in progress: the address to offer when the browser did not open, and whether a code is expected. */
export interface SignIn {
  accountId: string;
  url?: string;
  acceptsCode: boolean;
  /** the code was sent and the provider is checking it */
  checking: boolean;
  error?: string;
}

export interface AgentState extends Transcript {
  connection: "idle" | "connecting" | "ready" | "error";
  error: { code: string; detail?: string; providerId?: string } | null;
  /** the providers this machine can run, as the library found them */
  detections: Detection[];
  /** every account in the shared EDUKORS registry */
  accounts: AccountInfo[];
  /** the account the agent runs on */
  accountId: string | null;
  /** its sign-in, as last checked */
  status: AccountStatus | null;
  provider: ProviderId | null;
  capabilities: Capabilities | null;
  models: ModelInfo[];
  mcp: McpState[];
  skills: SkillInfo[];
  /** the library's session of the open conversation */
  sessionId: string | null;
  /** the open conversation, as the editor saves it */
  conversationId: string;
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
  usage: UsageReport | null;
  usageState: "idle" | "loading" | "error";
  signIn: SignIn | null;

  ensure(): Promise<void>;
  newSession(): Promise<void>;
  resume(conversationId: string): Promise<void>;
  send(text: string, files?: string[]): Promise<void>;
  interrupt(): void;
  answer(id: string, answer: Answer): void;
  setModel(model: string): void;
  setMode(mode: Mode): void;
  setEffort(effort: Effort): void;
  toggleSelection(): void;
  loadSessions(): Promise<void>;
  deleteSession(conversationId: string): Promise<void>;
  loadUsage(force?: boolean): Promise<void>;
  retry(): Promise<void>;

  /** Accounts, for the panel and the preferences. */
  refreshAccounts(): Promise<void>;
  selectAccount(accountId: string): Promise<void>;
  addAccount(providerId: ProviderId, label: string): Promise<string>;
  connectAccount(accountId: string): Promise<void>;
  submitCode(code: string): Promise<void>;
  cancelSignIn(): void;
  renameAccount(accountId: string, label: string): Promise<void>;
  logoutAccount(accountId: string): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
  accountStatus(accountId: string): Promise<AccountStatus>;
}

/** How long a usage report counts as fresh: replies close together share one. */
const USAGE_FRESH_MS = 15_000;
/** A turn runs as long as it takes; this only frees the request if the host never answers. */
const TURN_TIMEOUT_MS = 24 * 3600_000;
const SIGN_IN_TIMEOUT_MS = 11 * 60_000;

const firstLine = (text: string) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? line.slice(0, 57).trimEnd() + "…" : line;
};

/** A conversation's name in the list: its title, or the start of its first message. */
export const sessionTitle = (s: SessionInfo) => s.title || (s.firstPrompt ? firstLine(splitContext(s.firstPrompt).text) : "") || s.id.slice(0, 8);

const errorOf = (e: unknown) =>
  e instanceof AgentError
    ? { code: e.code, detail: e.message !== e.code ? e.message : undefined, ...(typeof e.meta?.providerId === "string" ? { providerId: e.meta.providerId } : {}) }
    : { code: "failed", detail: e instanceof Error ? e.message : String(e) };

const newId = () => crypto.randomUUID();

/** The library's limit windows, as the usage display names them. */
const WINDOWS: Record<string, string> = { five_hour: "5h", seven_day: "weekly" };
const limitsOf = (windows: { name: string; used: number; resetsAt?: string }[] = []): UsageLimit[] =>
  windows.map((w) => ({ window: WINDOWS[w.name] ?? w.name, percent: w.used * 100, ...(w.resetsAt ? { resetsAt: Date.parse(w.resetsAt) } : {}) }));

/** The models as the composer offers them: the provider's default first, as "default". */
function modelsOf(list: { id: string; label?: string; efforts?: string[]; default?: boolean }[]): ModelInfo[] {
  const fallback = list.find((m) => m.default && m.id !== "default");
  const own = list.find((m) => m.id === "default");
  const head: ModelInfo = { value: "default", displayName: own?.label ?? "", ...(fallback ? { resolved: fallback.id } : {}), ...(own?.efforts ? { efforts: own.efforts } : fallback?.efforts ? { efforts: fallback.efforts } : {}) };
  return [head, ...list.filter((m) => m.id !== "default").map((m) => ({ value: m.id, displayName: m.label ?? m.id, ...(m.default ? { resolved: m.id } : {}), ...(m.efforts?.length ? { efforts: m.efforts } : {}) }))];
}

/** The sign-in request in flight, to cancel it. */
let signInRequest: number | null = null;
/** Answers to the cards on screen, by ask id. */
const resolvers = new Map<string, (answer: Answer) => void>();
/** Tools the person allowed for the rest of the conversation. */
let allowed = new Set<string>();
/** The question cards, by ask id: the library's question id. */
const questions = new Map<string, string>();
let opening: Promise<void> | null = null;
let usageLoading: Promise<void> | null = null;
let skillsDir: string | null = null;
/** A resume id to give the next session, when a saved conversation is reopened. */
let pendingResume: string | undefined;

export const useAgent = create<AgentState>()((set, get) => {
  const prefs = () => usePrefs.getState().agent;

  const persist = () => {
    const { accountId, model, mode, effort } = get();
    const agent = prefs();
    // A preference that could not be written is not worth stopping the conversation for.
    void usePrefs
      .getState()
      .save({
        agent: {
          ...agent,
          account: accountId,
          accounts: accountId ? { ...agent.accounts, [accountId]: { model, effort } } : agent.accounts,
          mode: mode === "plan" ? "ask" : mode,
        },
      })
      .catch(() => undefined);
  };

  /** Puts a card on screen and waits for the person. */
  const ask = (card: Omit<Ask, "id">): Promise<Answer> =>
    new Promise((resolve) => {
      const id = newId();
      resolvers.set(id, resolve);
      set((s) => ({ asks: [...s.asks, { id, ...card }] }));
    });

  /** Withdraws every card: the turn ended, or the conversation closed. */
  const dropAsks = (message: string) => {
    for (const [id, resolve] of resolvers) {
      resolvers.delete(id);
      resolve({ behavior: "deny", message });
    }
    questions.clear();
    set({ asks: [] });
  };

  /** Saves the conversation as it stands, once it has a message. */
  const save = () => {
    const s = get();
    const first = s.items.find((it) => it.kind === "user");
    if (!first || !s.accountId || !s.provider) return;
    void saveConversation({
      id: s.conversationId,
      title: s.title ?? firstLine(first.kind === "user" ? first.text : ""),
      firstPrompt: first.kind === "user" ? first.text : undefined,
      lastModified: Date.now(),
      accountId: s.accountId,
      providerId: s.provider,
      ...(lastResumeId ? { resumeId: lastResumeId } : {}),
      items: settle(s).items,
    }).catch(() => undefined);
  };
  let lastResumeId: string | undefined;

  /** The editor's gate: what goes ahead, what waits for the person, what plan mode refuses. */
  async function gate(tool: string, input: Record<string, unknown>, callId: string, external: boolean): Promise<{ allow: true } | { allow: false; message: string }> {
    const mode = get().mode;
    const kind = external ? "external" : kindOf(tool);
    if (kind === "read" || kind === "view") return { allow: true };
    if (mode === "plan") return { allow: false, message: "Plan mode is on: do not change the course or call other servers yet. Present the plan and wait for the person to approve it." };
    if (mode === "auto" || allowed.has(tool)) return { allow: true };
    const answer = await ask({ kind: "permission", tool, input, toolUseId: callId, reason: null });
    if (answer.behavior !== "allow") return { allow: false, message: answer.message || "The person declined this action." };
    if (answer.always) allowed.add(tool);
    return { allow: true };
  }

  async function onHostRequest(req: HostRequest): Promise<unknown> {
    const p = req.params as { sessionId?: string; callId?: string; name?: string; args?: Record<string, unknown>; server?: string; tool?: string; input?: Record<string, unknown> };
    const live = p.sessionId === get().sessionId;
    const callId = String(p.callId ?? "");
    if (req.method === "tool.authorize") {
      if (!live) return { allow: false, message: "That conversation is no longer open." };
      const name = `mcp__${p.server}__${p.tool}`;
      set((s) => setToolInput(s, callId, p.input ?? {}));
      const verdict = await gate(name, p.input ?? {}, callId, true);
      return verdict.allow ? { allow: true } : { allow: false, message: verdict.message };
    }
    // tool.call: one of the editor's own tools.
    if (!live) return { content: "That conversation is no longer open.", isError: true };
    const name = String(p.name ?? "");
    const args = p.args ?? {};
    set((s) => setToolInput(s, callId, args));
    if (kindOf(name) === "plan") {
      const answer = await ask({ kind: "plan", tool: "plan_ready", input: args, toolUseId: callId, reason: null });
      if (answer.behavior !== "allow") return { content: answer.message || "The person wants to keep planning.", isError: true };
      const mode = answer.mode === "auto" ? "auto" : "ask";
      set({ mode });
      persist();
      return {
        content:
          mode === "auto"
            ? "The plan is approved. Carry it out now; the editor applies your changes without asking again."
            : "The plan is approved. Carry it out now; each change to the course still waits for the person's approval.",
      };
    }
    const verdict = await gate(`mcp__${SERVER}__${name}`, args, callId, false);
    if (!verdict.allow) return { content: verdict.message, isError: true };
    const result = await runTool(name, args, get().docId);
    if (result.docId) set({ docId: result.docId });
    set((s) => setToolResult(s, callId, result.text));
    return { content: result.text, ...(result.isError ? { isError: true } : {}) };
  }

  function onEvent(ev: AiEvent) {
    const s = get();
    // The servers' status comes while the session opens, before the panel has its id.
    const opening = ev.type === "mcpServerStatus" && s.sessionId === null && ev.documentId === s.conversationId;
    if (ev.sessionId !== s.sessionId && !opening) return;
    switch (ev.type) {
      case "question": {
        const id = newId();
        questions.set(id, ev.questionId);
        const input = { questions: [{ question: ev.prompt, ...(ev.options?.length ? { options: ev.options.map((label) => ({ label })) } : { options: [] }), multiSelect: false }] };
        set({ asks: [...s.asks, { id, kind: "question", tool: "question", input, toolUseId: ev.questionId, reason: null }] });
        return;
      }
      case "usageUpdated":
        if (ev.usage.windows?.length) set({ usage: { text: "", at: Date.parse(ev.usage.observedAt) || Date.now(), limits: limitsOf(ev.usage.windows) } });
        return;
      case "mcpServerStatus":
        set({ mcp: [...s.mcp.filter((m) => m.name !== ev.server), { name: ev.server, status: ev.status, ...(ev.error ? { error: ev.error } : {}) }] });
        return;
      case "sessionClosed":
        set({ ...settle(s), busy: false, sessionId: null });
        dropAsks("The conversation was closed.");
        return;
      case "error":
        if (!ev.requestId) {
          // The provider stopped between turns: the library starts it again with the next message.
          set({ items: [...s.items, notice("warning", ev.error.message, ev.error.code)] });
          return;
        }
        break;
    }
    const next = applyEvent(s, ev);
    if (ev.type === "turnCompleted" || ev.type === "cancelled" || ev.type === "error") {
      set({ ...settle(next), busy: false });
      dropAsks("The turn ended.");
      save();
      void get().loadUsage();
    } else if (next !== s) set({ items: next.items, live: next.live });
  }

  function onLogin(msg: LoginMessage) {
    const sign = get().signIn;
    if (sign?.accountId === msg.accountId) set({ signIn: { ...sign, url: msg.url, acceptsCode: msg.acceptsCode } });
  }

  setHandlers({
    event: onEvent,
    login: onLogin,
    hostRequest: onHostRequest,
    exit(stderr) {
      const s = get();
      const was = s.connection;
      dropAsks("The agent stopped.");
      set({ ...settle(s), busy: false, sessionId: null, connection: was === "error" ? "error" : "idle", signIn: null });
      if (was === "ready" && s.items.length) set({ items: [...get().items, notice("error", stderr, "exited")] });
    },
  });

  /** The account to run on: the one chosen, else the first this editor can use. */
  const chooseAccount = (accounts: AccountInfo[]) => {
    const chosen = prefs().account;
    return accounts.find((a) => a.id === chosen && a.supported) ?? accounts.find((a) => a.supported) ?? null;
  };

  /** Opens a library session for the conversation on screen. */
  async function openSession() {
    const s = get();
    const account = s.accounts.find((a) => a.id === s.accountId);
    if (!account) return;
    skillsDir ??= (await call<{ skills: string }>("agent_paths").catch(() => null))?.skills ?? null;
    const servers = parseMcpConfig(prefs().mcp).servers;
    const skills = skillsDir ? await request<SkillInfo[]>("skills.list", { dir: skillsDir }).catch(() => []) : [];
    set({ skills, mcp: Object.keys(servers).map((name) => ({ name, status: "pending" as const })) });
    const { sessionId, resumeId } = await request<{ sessionId: string; resumeId: string | null }>(
      "session.open",
      {
        accountId: account.id,
        // Sessions are the conversation's: it may move between courses as the person changes tabs.
        documentId: s.conversationId,
        instructions: systemPrompt(prefs().instructions, { skills: skills.length > 0, mcp: Object.keys(servers).length > 0 }),
        tools: toolSpecs(),
        options: { ...(s.model !== "default" ? { model: s.model } : {}), ...(s.effort !== "auto" ? { effort: s.effort } : {}) },
        ...(pendingResume ? { resumeId: pendingResume } : {}),
        ...(Object.keys(servers).length ? { mcpServers: servers } : {}),
        ...(skillsDir && skills.length ? { skillsDir } : {}),
      },
      180_000,
    );
    pendingResume = undefined;
    lastResumeId = resumeId ?? undefined;
    set({ sessionId, status: { state: "connected" } });
    void loadModels(account.id);
  }

  async function loadModels(accountId: string) {
    if (!get().capabilities?.models) return;
    try {
      const list = await request<{ id: string; label?: string; efforts?: string[]; default?: boolean }[]>("models.list", { accountId }, 60_000);
      if (get().accountId === accountId) set({ models: modelsOf(list) });
    } catch {
      /* the composer offers the default alone */
    }
  }

  /** Starts the process, reads the accounts, and opens a conversation on the chosen one. */
  async function start() {
    set({ connection: "connecting", error: null });
    try {
      await connect();
      await get().refreshAccounts();
      const account = chooseAccount(get().accounts);
      if (!account) {
        set({ connection: "ready", accountId: null, provider: null, status: null });
        return;
      }
      await useAccount(account);
      await openSession();
      set({ connection: "ready" });
    } catch (e) {
      const error = errorOf(e);
      if (error.code === "ACCOUNT_DISCONNECTED" || error.code === "ACCOUNT_EXPIRED") {
        // Nothing to open until the account signs in: the panel offers it.
        set({ connection: "ready", status: { state: error.code === "ACCOUNT_EXPIRED" ? "expired" : "disconnected" } });
        return;
      }
      set({ connection: "error", error });
      throw e;
    }
  }

  /** Makes an account the conversation's: its provider, capabilities and composer settings. */
  async function useAccount(account: AccountInfo) {
    const saved = prefs().accounts[account.id] ?? { model: "default", effort: "auto" };
    const capabilities = await request<Capabilities>("providers.capabilities", { providerId: account.providerId }).catch(() => null);
    set({
      accountId: account.id,
      provider: account.providerId as ProviderId,
      capabilities,
      model: saved.model,
      effort: saved.effort as Effort,
      models: [],
      usage: null,
      usageState: "idle",
    });
  }

  return {
    ...emptyTranscript(),
    connection: "idle",
    error: null,
    detections: [],
    accounts: [],
    accountId: null,
    status: null,
    provider: null,
    capabilities: null,
    models: [],
    mcp: [],
    skills: [],
    sessionId: null,
    conversationId: newId(),
    title: null,
    busy: false,
    planTurn: false,
    asks: [],
    sessions: null,
    docId: null,
    model: "default",
    mode: DEFAULT_PREFS.agent.mode,
    effort: "auto",
    withSelection: true,
    usage: null,
    usageState: "idle",
    signIn: null,

    async ensure() {
      if (get().connection === "ready" && get().sessionId) return;
      if (!opening) {
        if (get().connection === "idle" && !get().items.length) set({ mode: prefs().mode });
        // A conversation that stopped with the process comes back where it was.
        if (get().items.length && lastResumeId) pendingResume = lastResumeId;
        opening = (get().connection === "ready" ? openSession() : start()).finally(() => (opening = null));
      }
      return opening;
    },

    async newSession() {
      const old = get().sessionId;
      dropAsks("The conversation was closed.");
      allowed = new Set();
      lastResumeId = undefined;
      pendingResume = undefined;
      set({ ...emptyTranscript(), conversationId: newId(), title: null, busy: false, planTurn: false, sessionId: null });
      if (old) await request("session.close", { sessionId: old }).catch(() => undefined);
      if (get().connection === "ready" && get().accountId && !opening) {
        opening = openSession()
          .catch((e) => set({ connection: "error", error: errorOf(e) }))
          .finally(() => (opening = null));
        return opening;
      }
      return get().ensure().catch(() => undefined);
    },

    async resume(conversationId) {
      if (conversationId === get().conversationId) return;
      try {
        const saved = await readConversation(conversationId);
        const old = get().sessionId;
        dropAsks("The conversation was closed.");
        allowed = new Set();
        if (old) await request("session.close", { sessionId: old }).catch(() => undefined);
        set({ items: saved.items, live: null, conversationId, title: saved.title, busy: false, planTurn: false, sessionId: null });
        lastResumeId = saved.resumeId;
        pendingResume = saved.resumeId;
        const account = get().accounts.find((a) => a.id === saved.accountId && a.supported);
        if (!account) {
          set({ items: [...get().items, notice("warning", "", "accountGone")] });
          return;
        }
        if (account.id !== get().accountId) await useAccount(account);
        await openSession();
      } catch (e) {
        set({ items: [...get().items, notice("error", errorOf(e).detail ?? "", `err.${errorOf(e).code}`)] });
      }
    },

    async send(text, files = []) {
      const body = text.trim();
      if (!body && !files.length) return;
      const context = messageContext(get().withSelection, get().mode);
      const chip = get().withSelection ? selectionLabel() : null;
      const requestId = newId();
      set((s) => ({
        items: [...s.items, { kind: "user", key: requestId, text: body, ...(chip ? { context: chip } : {}), ...(files.length ? { files } : {}) }],
        busy: true,
        planTurn: s.mode === "plan",
        docId: context.docId ?? s.docId,
        title: s.title ?? firstLine(body || files.map(fileName).join(", ")),
      }));
      save();
      try {
        await get().ensure();
        const sessionId = get().sessionId;
        if (!sessionId) throw new AgentError(get().accountId ? "ACCOUNT_DISCONNECTED" : "no-account");
        const message = await withFiles(body, files);
        // The editor's context goes in front of the message, where the prompt says it is.
        const result = await request<{ status: string; error?: { code: string; message: string } }>("session.send", { sessionId, text: `${context.block}\n\n${message}`, requestId }, TURN_TIMEOUT_MS);
        if (result.status === "failed" && get().busy) set({ busy: false });
      } catch (e) {
        const error = errorOf(e);
        set((s) => ({ busy: false, items: [...s.items, notice("error", error.detail ?? "", `err.${error.code}`)] }));
      }
    },

    interrupt() {
      const { busy, sessionId } = get();
      if (!busy || !sessionId) return;
      void request("session.interrupt", { sessionId }).catch(() => undefined);
    },

    answer(id, answer) {
      set((s) => ({ asks: s.asks.filter((a) => a.id !== id) }));
      const questionId = questions.get(id);
      if (questionId) {
        questions.delete(id);
        const sessionId = get().sessionId;
        const answers = answer.behavior === "allow" ? (answer.updatedInput?.answers as Record<string, string> | undefined) : undefined;
        const text = answers ? Object.values(answers).join(", ") : answer.behavior === "deny" && answer.message ? answer.message : "The person chose not to answer; go on with your best judgement.";
        if (sessionId) void request("session.answer", { sessionId, questionId, answer: text }).catch(() => undefined);
        return;
      }
      const resolve = resolvers.get(id);
      resolvers.delete(id);
      resolve?.(answer);
      if (answer.behavior === "allow" && answer.mode) {
        set({ mode: answer.mode });
        persist();
      }
    },

    setModel(model) {
      // A model without effort levels takes none: the effort chosen for another would not apply.
      const levels = get().models.find((m) => m.value === model)?.efforts;
      const effort = get().models.length && !levels?.length && get().effort !== "auto" ? "auto" : null;
      set({ model, ...(effort ? { effort } : {}) });
      persist();
      const sessionId = get().sessionId;
      if (sessionId) void request("session.updateOptions", { sessionId, options: { model: model === "default" ? "" : model, ...(effort ? { effort: "" } : {}) } }).catch(() => undefined);
    },

    setMode(mode) {
      set({ mode });
      persist();
    },

    setEffort(effort) {
      set({ effort });
      persist();
      const sessionId = get().sessionId;
      if (sessionId) void request("session.updateOptions", { sessionId, options: { effort: effort === "auto" ? "" : effort } }).catch(() => undefined);
    },

    toggleSelection() {
      set((s) => ({ withSelection: !s.withSelection }));
    },

    async loadSessions() {
      try {
        set({ sessions: await listConversations() });
      } catch {
        set((s) => ({ sessions: s.sessions ?? [] }));
      }
    },

    async deleteSession(conversationId) {
      await deleteConversation(conversationId);
      set((s) => ({ sessions: (s.sessions ?? []).filter((x) => x.id !== conversationId) }));
      if (conversationId === get().conversationId) await get().newSession();
    },

    async loadUsage(force = false) {
      const { capabilities, accountId, connection, usage } = get();
      if (!capabilities?.usage || !accountId || connection !== "ready") return;
      if (usage && Date.now() - usage.at < USAGE_FRESH_MS && !force) return;
      if (!usageLoading) {
        set({ usageState: "loading" });
        usageLoading = request<{ windows?: { name: string; used: number; resetsAt?: string }[]; observedAt: string } | null>("usage.read", { accountId }, 45_000)
          .then((read) => set({ usage: read ? { text: "", at: Date.parse(read.observedAt) || Date.now(), limits: limitsOf(read.windows) } : null, usageState: "idle" }))
          .catch(() => set({ usageState: "error" }))
          .finally(() => (usageLoading = null));
      }
      return usageLoading;
    },

    async retry() {
      set({ connection: "idle", error: null, signIn: null });
      await get().ensure().catch(() => undefined);
    },

    async refreshAccounts() {
      await connect();
      const [accounts, detections] = await Promise.all([request<AccountInfo[]>("accounts.list"), request<Detection[]>("providers.detect", { refresh: true })]);
      set({ accounts, detections });
    },

    async selectAccount(accountId) {
      const account = get().accounts.find((a) => a.id === accountId);
      if (!account || accountId === get().accountId) return;
      const old = get().sessionId;
      dropAsks("The conversation was closed.");
      allowed = new Set();
      lastResumeId = undefined;
      pendingResume = undefined;
      set({ ...emptyTranscript(), conversationId: newId(), title: null, busy: false, sessionId: null, status: null });
      if (old) await request("session.close", { sessionId: old }).catch(() => undefined);
      await useAccount(account);
      persist();
      await get().ensure().catch(() => undefined);
    },

    async addAccount(providerId, label) {
      await connect();
      const account = await request<AccountInfo>("accounts.create", { providerId, label });
      await get().refreshAccounts();
      return account.id;
    },

    async connectAccount(accountId) {
      set({ signIn: { accountId, acceptsCode: false, checking: false } });
      try {
        await connect();
        const pending = request<AccountStatus>("accounts.connect", { accountId }, SIGN_IN_TIMEOUT_MS);
        signInRequest = lastRequestId();
        await pending;
        set({ signIn: null });
        await get().refreshAccounts();
        if (!get().accountId || get().accountId === accountId) {
          if (!get().accountId) await get().selectAccount(accountId);
          else await get().retry();
        }
      } catch (e) {
        const error = errorOf(e);
        set((s) => ({ signIn: s.signIn?.accountId === accountId && error.code !== "CANCELLED" ? { ...s.signIn, checking: false, error: error.code } : null }));
      } finally {
        signInRequest = null;
      }
    },

    async submitCode(code) {
      const sign = get().signIn;
      if (!sign) return;
      set({ signIn: { ...sign, checking: true, error: undefined } });
      try {
        await request("accounts.submitCode", { accountId: sign.accountId, code });
      } catch (e) {
        set({ signIn: { ...sign, checking: false, error: errorOf(e).code } });
      }
    },

    cancelSignIn() {
      if (signInRequest !== null) void request("cancel", { requestId: signInRequest }).catch(() => undefined);
      set({ signIn: null });
    },

    async renameAccount(accountId, label) {
      await request("accounts.rename", { accountId, label });
      await get().refreshAccounts();
    },

    async logoutAccount(accountId) {
      await request("accounts.logout", { accountId });
      if (accountId === get().accountId) set({ status: { state: "disconnected" }, sessionId: null });
    },

    async removeAccount(accountId) {
      await request("accounts.remove", { accountId, deleteData: true });
      const agent = prefs();
      const { [accountId]: _, ...rest } = agent.accounts;
      await usePrefs.getState().save({ agent: { ...agent, accounts: rest, account: agent.account === accountId ? null : agent.account } }).catch(() => undefined);
      await get().refreshAccounts();
      if (accountId === get().accountId) {
        set({ ...emptyTranscript(), accountId: null, provider: null, sessionId: null, status: null, conversationId: newId(), title: null });
        await get().retry();
      }
    },

    accountStatus: (accountId) => request<AccountStatus>("accounts.status", { accountId }, 60_000),
  };
});
