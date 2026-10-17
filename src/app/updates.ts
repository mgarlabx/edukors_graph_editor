/**
 * Updates, from the project's GitHub releases: the app reads the latest.json
 * of the last published release (src-tauri/tauri.conf.json → plugins.updater),
 * and installs the new version once the person says so, its signature checked
 * against the key the app is built with.
 *
 * On opening it looks on its own, once a day at most and quietly, unless the
 * preferences say not to; "Check for updates…" in the menu always answers.
 * Before anything is downloaded the unsaved courses are settled and the agent
 * is stopped: on Windows the app closes as soon as the download ends, to let
 * the installer run (which opens it again), and the agent, which runs from the
 * app's folder, must not be in the installer's way. On the Mac the
 * new app takes the old one's place and the app restarts.
 *
 * Installed from the Microsoft Store, the app does none of this: the Store
 * brings the updates (scripts/make-msix.mjs).
 */
import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import { disconnect } from "../agent/client";
import { errorText } from "../i18n/errors";
import { settleAll } from "./files";
import { termsAccepted } from "./TermsModal";
import { native } from "./platform";

/** How long the quiet check waits before looking again. */
export const CHECK_EVERY = 24 * 60 * 60 * 1000;

export type UpdateStatus = "checking" | "latest" | "available" | "downloading" | "error";

interface UpdateState {
  status: UpdateStatus;
  update: Update | null;
  error: string;
  /** bytes downloaded, and of how many (null while the server has not said) */
  done: number;
  total: number | null;
}

export const useUpdate = create<UpdateState>()(() => ({ status: "checking", update: null, error: "", done: 0, total: null }));

let store: Promise<boolean> | null = null;

/** Whether the app came from the Microsoft Store, asked once. */
export const fromStore = (): Promise<boolean> => (store ??= native.fromStore().catch(() => false));

let waiting: (() => void) | null = null;

/** Shows the modal: now, or once nothing else is on screen (the opening, the terms, another dialog). */
function show() {
  const free = () => termsAccepted() && useUi.getState().modal === null;
  if (free()) return useUi.getState().open("update");
  if (waiting) return;
  waiting = useUi.subscribe(() => {
    if (!free()) return;
    waiting?.();
    waiting = null;
    if (useUpdate.getState().status === "available") useUi.getState().open("update");
  });
}

/**
 * Looks for a new version. Quiet, it says something only when there is one;
 * otherwise the modal opens at once and says what was found. True when the
 * server answered.
 */
export async function checkForUpdate({ silent = false } = {}): Promise<boolean> {
  if (useUpdate.getState().status === "downloading") return true;
  if (!silent) {
    useUpdate.setState({ status: "checking", update: null, error: "" });
    useUi.getState().open("update");
  }
  try {
    const update = await check();
    if (update) {
      useUpdate.setState({ status: "available", update, error: "" });
      if (silent) show();
    } else if (!silent) useUpdate.setState({ status: "latest" });
    return true;
  } catch (e) {
    if (!silent) useUpdate.setState({ status: "error", error: errorText(e) });
    return false;
  }
}

/** On opening: the quiet check, when the preferences allow it and a day has gone by since the last one that got an answer. */
export async function autoCheck(now = Date.now()): Promise<void> {
  const { updates } = usePrefs.getState();
  if (!updates.auto || now - updates.lastCheck < CHECK_EVERY || (await fromStore())) return;
  if (await checkForUpdate({ silent: true })) await usePrefs.getState().save({ updates: { ...usePrefs.getState().updates, lastCheck: now } });
}

/** Installs the update found. False when the person kept a course from being closed, or it failed (the modal then says why). */
export async function installUpdate(): Promise<boolean> {
  const { update } = useUpdate.getState();
  if (!update) return false;
  if (!(await settleAll())) return false;
  useUpdate.setState({ status: "downloading", done: 0, total: null, error: "" });
  try {
    await disconnect();
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") useUpdate.setState({ total: event.data.contentLength ?? null });
      else if (event.event === "Progress") useUpdate.setState((s) => ({ done: s.done + event.data.chunkLength }));
    });
    // Only the Mac gets here: on Windows the installer has already closed the app.
    await relaunch();
    return true;
  } catch (e) {
    useUpdate.setState({ status: "error", error: errorText(e) });
    return false;
  }
}
