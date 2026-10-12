/**
 * Updates (src/app/updates.ts), with the updater, the restart, the unsaved
 * courses and the agent stood in for: the quiet check at most once a day and
 * only when allowed, silent when there is nothing new or no answer; the menu's
 * check always answering; and an install that settles the courses and stops
 * the agent before downloading, or goes no further when a course is kept.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const fake = vi.hoisted(() => ({
  check: vi.fn(),
  settle: vi.fn(async () => true),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: fake.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn(async () => void calls.push("relaunch")) }));
vi.mock("../src/app/files", () => ({ settleAll: async () => (calls.push("settle"), fake.settle()) }));
vi.mock("../src/agent/client", () => ({ disconnect: async () => void calls.push("agent-stop") }));
vi.mock("../src/app/TermsModal", () => ({ termsAccepted: () => true }));
vi.mock("../src/app/platform", async (original) => {
  const real = await original<typeof import("../src/app/platform")>();
  return { ...real, native: { ...real.native, prefsSave: async () => undefined } };
});

import { CHECK_EVERY, autoCheck, checkForUpdate, installUpdate, useUpdate } from "../src/app/updates";
import { usePrefs } from "../src/store/prefs";
import { useUi } from "../src/store/ui";

const NOW = 1_800_000_000_000;

const newVersion = () => ({
  version: "2.12.0",
  body: "- novidade",
  downloadAndInstall: vi.fn(async (progress: (e: unknown) => void) => {
    calls.push("download");
    progress({ event: "Started", data: { contentLength: 100 } });
    progress({ event: "Progress", data: { chunkLength: 60 } });
    progress({ event: "Progress", data: { chunkLength: 40 } });
    progress({ event: "Finished" });
  }),
});

beforeEach(() => {
  calls.length = 0;
  fake.check.mockReset();
  fake.settle.mockReset().mockResolvedValue(true);
  usePrefs.setState({ updates: { auto: true, lastCheck: 0 } });
  useUi.setState({ modal: null });
  useUpdate.setState({ status: "checking", update: null, error: "", done: 0, total: null });
});

describe("the quiet check on opening", () => {
  it("looks once a day at most, and records when it got an answer", async () => {
    fake.check.mockResolvedValue(null);
    await autoCheck(NOW);
    expect(fake.check).toHaveBeenCalledTimes(1);
    expect(usePrefs.getState().updates.lastCheck).toBe(NOW);
    await autoCheck(NOW + CHECK_EVERY - 1);
    expect(fake.check).toHaveBeenCalledTimes(1);
    await autoCheck(NOW + CHECK_EVERY);
    expect(fake.check).toHaveBeenCalledTimes(2);
  });

  it("does not look when the preferences say not to", async () => {
    usePrefs.setState({ updates: { auto: false, lastCheck: 0 } });
    await autoCheck(NOW);
    expect(fake.check).not.toHaveBeenCalled();
  });

  it("says nothing when there is no new version or no answer, and tries again next time without one", async () => {
    fake.check.mockResolvedValue(null);
    await autoCheck(NOW);
    expect(useUi.getState().modal).toBeNull();
    usePrefs.setState({ updates: { auto: true, lastCheck: 0 } });
    fake.check.mockRejectedValue(new Error("offline"));
    await autoCheck(NOW);
    expect(useUi.getState().modal).toBeNull();
    expect(usePrefs.getState().updates.lastCheck).toBe(0);
  });

  it("shows a new version once the dialog on screen is closed", async () => {
    useUi.setState({ modal: "about" });
    fake.check.mockResolvedValue(newVersion());
    await autoCheck(NOW);
    expect(useUi.getState().modal).toBe("about");
    useUi.getState().close();
    expect(useUi.getState().modal).toBe("update");
    expect(useUpdate.getState().status).toBe("available");
  });
});

describe("the check from the menu", () => {
  it("says when the version is the latest", async () => {
    fake.check.mockResolvedValue(null);
    await checkForUpdate();
    expect(useUi.getState().modal).toBe("update");
    expect(useUpdate.getState().status).toBe("latest");
  });

  it("says why it could not find out", async () => {
    fake.check.mockRejectedValue(new Error("offline"));
    await checkForUpdate();
    expect(useUpdate.getState()).toMatchObject({ status: "error", error: expect.stringContaining("offline") });
  });
});

describe("installing", () => {
  it("settles the courses and stops the agent before downloading, then restarts", async () => {
    const update = newVersion();
    useUpdate.setState({ status: "available", update: update as never });
    expect(await installUpdate()).toBe(true);
    expect(calls).toEqual(["settle", "agent-stop", "download", "relaunch"]);
    expect(useUpdate.getState()).toMatchObject({ done: 100, total: 100 });
  });

  it("goes no further when the person keeps a course from being closed", async () => {
    const update = newVersion();
    fake.settle.mockResolvedValue(false);
    useUpdate.setState({ status: "available", update: update as never });
    expect(await installUpdate()).toBe(false);
    expect(calls).toEqual(["settle"]);
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(useUpdate.getState().status).toBe("available");
  });

  it("says why when the download or the signature fails", async () => {
    const update = newVersion();
    update.downloadAndInstall.mockRejectedValue(new Error("signature verification failed"));
    useUpdate.setState({ status: "available", update: update as never });
    expect(await installUpdate()).toBe(false);
    expect(useUpdate.getState()).toMatchObject({ status: "error", error: expect.stringContaining("signature") });
    expect(calls).not.toContain("relaunch");
  });
});
