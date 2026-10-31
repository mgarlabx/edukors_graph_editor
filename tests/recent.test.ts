/**
 * A recent file that was moved or deleted (src/app/files.ts, openRecent):
 * "File not found", and the choice to remove it from the list or keep it;
 * a file that is there opens as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  files: new Set<string>(),
  answer: false,
  asked: [] as { message: string; title: string; ok: string; cancel: string }[],
  read: [] as string[],
}));

vi.mock("../src/app/platform", async (original) => {
  const real = await original<typeof import("../src/app/platform")>();
  return {
    ...real,
    alertDialog: async () => undefined,
    confirmDialog: async (message: string, title: string, ok: string, cancel: string) => (fake.asked.push({ message, title, ok, cancel }), fake.answer),
    native: {
      ...real.native,
      prefsSave: async () => undefined,
      setMenu: async () => undefined,
      fileExists: async (path: string) => fake.files.has(path),
      readText: async (path: string) => (fake.read.push(path), "{}"),
    },
  };
});

import { openRecent } from "../src/app/files";
import { usePrefs } from "../src/store/prefs";
import { t } from "../src/i18n";

const recent = () => usePrefs.getState().recent;

beforeEach(() => {
  fake.files.clear();
  fake.asked.length = 0;
  fake.read.length = 0;
  usePrefs.setState({ recent: ["/c/gone.egf", "/c/here.egf"] });
});

describe("recent files", () => {
  it("a missing file warns and, on Remove, leaves the list", async () => {
    fake.answer = true;
    await openRecent("/c/gone.egf");
    expect(fake.asked).toHaveLength(1);
    expect(fake.asked[0].title).toBe(t("file.notFound"));
    expect(fake.asked[0].message).toContain("/c/gone.egf");
    expect(fake.asked[0].ok).toBe(t("file.removeRecent"));
    expect(recent()).toEqual(["/c/here.egf"]);
    expect(fake.read).toEqual([]);
  });

  it("on Keep, the line stays", async () => {
    fake.answer = false;
    await openRecent("/c/gone.egf");
    expect(fake.asked).toHaveLength(1);
    expect(recent()).toEqual(["/c/gone.egf", "/c/here.egf"]);
  });

  it("a file that is there opens without asking", async () => {
    fake.files.add("/c/here.egf");
    await openRecent("/c/here.egf");
    expect(fake.asked).toEqual([]);
    expect(fake.read).toEqual(["/c/here.egf"]);
  });
});
