/**
 * What the preview knows about the simulated student: every state the player
 * wrote, the path taken and why, the calls made to the AI, and what the course
 * wrote to the browser's console. Kept in memory for the session only; nothing
 * here is ever written to the course.
 *
 * One per open course: the store holds the one on screen, and the others wait
 * here until their tab comes back (switchSession).
 */
import { create } from "zustand";
import type { Vars } from "../judge/pipeline";

export interface PlayerState {
  lang: string;
  isLanguageChosen?: boolean;
  currentId: string | null;
  history: string[];
  vars: Vars;
  answers: Record<string, unknown>;
}

export interface Step {
  from: string;
  to: string | null;
  edge: number;
  reason: string;
}

export interface CallLog {
  id: number;
  node: string;
  kind: "generate" | "judge";
  endpoint: string;
  model: string;
  answered: string;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
  ms: number;
  ok: boolean;
  note: string;
  request: unknown;
  response: string;
  at: string;
}

export interface Screen {
  cover: boolean;
  reviewing: string | null;
}

const COVER: Screen = { cover: true, reviewing: null };

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

/** A line the course wrote to the console: from the player itself, or from an HTML step inside it. */
export interface ConsoleEntry {
  id: number;
  level: ConsoleLevel;
  text: string;
  frame: "player" | "step";
  /** the step's title, for a line from an HTML step */
  title: string | null;
  at: string;
}

interface PreviewState {
  /** the tab this session belongs to */
  doc: string | null;
  states: PlayerState[];
  steps: Step[];
  calls: CallLog[];
  console: ConsoleEntry[];
  notJudged: { node: string; reason: string; at: string }[];
  lang: string | null;
  /** bumped to rebuild the iframe; seed is the state it starts from */
  reload: number;
  seed: PlayerState | null;
  /** what the player shows: its cover, or a step (an earlier one when the student reviews it) */
  screen: Screen;
  record(state: PlayerState, step: Step | null): void;
  /** `doc`: the tab that made the call, for answers that come back after it was left */
  log(call: Omit<CallLog, "id" | "at">, doc?: string | null): CallLog;
  noteNotJudged(node: string, reason: string, doc?: string | null): void;
  /** `at`: when the course wrote it, in ms */
  logConsole(entry: Omit<ConsoleEntry, "id" | "at"> & { at: number }, doc?: string | null): void;
  clearConsole(): void;
  restart(): void;
  goBack(node: string): void;
  setLang(lang: string | null): void;
  setScreen(screen: Screen): void;
  clearLog(): void;
}

/** What a course's preview keeps while its tab is in the background. */
export type PreviewSession = Pick<PreviewState, "states" | "steps" | "calls" | "console" | "notJudged" | "lang" | "seed" | "screen">;

const emptySession = (): PreviewSession => ({ states: [], steps: [], calls: [], console: [], notJudged: [], lang: null, seed: null, screen: COVER });

const parked = new Map<string, PreviewSession>();

let callId = 0;
let consoleId = 0;

export const usePreview = create<PreviewState>()((set, get) => ({
  doc: null,
  states: [],
  steps: [],
  calls: [],
  console: [],
  notJudged: [],
  lang: null,
  reload: 0,
  seed: null,
  screen: COVER,

  record(state, step) {
    set((s) => ({ states: [...s.states, state], steps: step ? [...s.steps, step] : s.steps }));
  },

  log(call, doc) {
    const entry = { ...call, id: ++callId, at: new Date().toLocaleTimeString() };
    touch(doc, (s) => ({ calls: [entry, ...s.calls].slice(0, 300) }));
    return entry;
  },

  noteNotJudged(node, reason, doc) {
    touch(doc, (s) => ({ notJudged: [{ node, reason, at: new Date().toLocaleTimeString() }, ...s.notJudged].slice(0, 100) }));
  },

  logConsole(entry, doc) {
    const line: ConsoleEntry = { ...entry, id: ++consoleId, at: new Date(entry.at).toLocaleTimeString() };
    touch(doc, (s) => ({ console: [...s.console, line].slice(-500) }));
  },

  clearConsole() {
    set({ console: [] });
  },

  /** A new student: the console starts over with them. */
  restart() {
    set((s) => ({ states: [], steps: [], console: [], seed: null, screen: COVER, reload: s.reload + 1 }));
  },

  /** Back to the last time the student stood on a node, with what they had then. */
  goBack(node) {
    const { states, steps } = get();
    let at = -1;
    for (let i = states.length - 1; i >= 0; i--)
      if (states[i].currentId === node) {
        at = i;
        break;
      }
    if (at === -1) return;
    const seed = structuredClone(states[at]);
    const kept = steps.filter((_, i) => i < seed.history.length);
    set((s) => ({ states: states.slice(0, at + 1), steps: kept, seed, screen: COVER, reload: s.reload + 1 }));
  },

  setLang(lang) {
    set((s) => ({ lang, states: [], steps: [], console: [], seed: null, screen: COVER, reload: s.reload + 1 }));
  },

  setScreen(screen) {
    set({ screen });
  },

  clearLog() {
    set({ calls: [], notJudged: [] });
  },
}));

export const currentState = (s: { states: PlayerState[] }) => s.states[s.states.length - 1] ?? null;

/** A change to the session of a tab, on screen or parked. */
function touch(doc: string | null | undefined, change: (s: PreviewSession) => Partial<PreviewSession>) {
  const live = usePreview.getState();
  if (doc === undefined || doc === live.doc) return usePreview.setState(change(live));
  const session = doc ? parked.get(doc) : undefined;
  if (doc && session) parked.set(doc, { ...session, ...change(session) });
}

/**
 * Puts the session on screen away under its tab and brings back the one of
 * `doc` (a course seen for the first time starts clean). The player picks up
 * at the step the student was left on.
 */
export function switchSession(doc: string | null) {
  const s = usePreview.getState();
  if (s.doc) parked.set(s.doc, { states: s.states, steps: s.steps, calls: s.calls, console: s.console, notJudged: s.notJudged, lang: s.lang, seed: s.seed, screen: s.screen });
  const next = (doc && parked.get(doc)) || emptySession();
  if (doc) parked.delete(doc);
  usePreview.setState({ ...next, doc, seed: currentState(next) ?? next.seed, screen: COVER, reload: s.reload + 1 });
}

/** A closed tab's session, gone with it. */
export const forgetSession = (doc: string) => void parked.delete(doc);
