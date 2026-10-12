/**
 * The usage limits Codex and Antigravity report, as the panel shows them, and
 * the files attached to a message: the cards' names, and the block that
 * carries their paths to the agent and back from a saved conversation.
 */
import { describe, expect, it } from "vitest";
import { codexUsage } from "../agent/providers/codexEvents.mjs";
import { agyUsage } from "../agent/providers/antigravityEvents.mjs";
import { groupLimits } from "../src/agent/usageReport";
import { fileName, shortName, splitFiles, withFiles } from "../src/agent/attachments";
import { fold } from "../src/agent/transcript";

/** `agy -p /usage --output-format json`, as agy 1.3.3 answers it (2026-10-12). */
const AGY = JSON.stringify({
  conversation_id: "",
  status: "SUCCESS",
  response: "Gemini Models\tWeekly Limit Remaining\t98%\t2026-10-15T18:13:08Z\n",
  usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  command: {
    name: "usage",
    data: {
      description: "Within each group, models share a weekly limit and a 5-hour limit.",
      groups: [
        {
          name: "Gemini Models",
          description: "Models within this group: Gemini Flash, Gemini Pro",
          buckets: [
            { id: "gemini-weekly", name: "Weekly Limit Remaining", window: "weekly", remaining_fraction: 0.98344486951828, reset_time: "2026-10-15T18:13:08Z" },
            { id: "gemini-5h", name: "Five Hour Limit Remaining", window: "5h", remaining_fraction: 0.25, reset_time: "2026-10-12T16:46:25Z" },
          ],
        },
        { name: "Claude and GPT models", buckets: [{ id: "3p-5h", name: "Five Hour Limit Remaining", window: "5h", remaining_fraction: 1, reset_time: "2026-10-12T19:18:07Z" }] },
      ],
    },
  },
});

describe("the usage limits of Codex and Antigravity", () => {
  it("reads Codex's rate limits: the five-hour and the weekly window", () => {
    const read = {
      rateLimits: { limitId: "codex", primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1791823591 }, secondary: { usedPercent: 3, windowDurationMins: 10080, resetsAt: 1792361763 }, credits: { hasCredits: false, unlimited: false, balance: "0" } },
      rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1791823591 }, secondary: { usedPercent: 3, windowDurationMins: 10080, resetsAt: 1792361763 } } },
    };
    expect(codexUsage(read)).toEqual({
      text: "",
      limits: [
        { window: "5h", percent: 12, resetsAt: 1791823591000 },
        { window: "weekly", percent: 3, resetsAt: 1792361763000 },
      ],
    });
  });

  it("names Codex's buckets when there is more than one, and says what credits are left", () => {
    const read = {
      rateLimits: {},
      rateLimitsByLimitId: {
        codex: { limitId: "codex", primary: { usedPercent: 50, windowDurationMins: 300 }, credits: { hasCredits: true, unlimited: false, balance: "12.50" } },
        other: { limitId: "other", limitName: "GPT-6 Pro", secondary: { usedPercent: 120, windowDurationMins: 1440 } },
      },
    };
    expect(codexUsage(read)).toEqual({
      text: "Credits: 12.50",
      limits: [
        { group: "codex", window: "5h", percent: 50 },
        { group: "GPT-6 Pro", window: "1440min", percent: 100 },
      ],
    });
    expect(codexUsage(null)).toEqual({ text: "", limits: [] });
  });

  it("reads Antigravity's quotas by group, as the share used", () => {
    const report = agyUsage(AGY)!;
    expect(report.limits).toEqual([
      { group: "Gemini Models", window: "weekly", percent: 1.7, resetsAt: Date.parse("2026-10-15T18:13:08Z") },
      { group: "Gemini Models", window: "5h", percent: 75, resetsAt: Date.parse("2026-10-12T16:46:25Z") },
      { group: "Claude and GPT models", window: "5h", percent: 0, resetsAt: Date.parse("2026-10-12T19:18:07Z") },
    ]);
    expect(report.text).toContain("share a weekly limit");
    expect(report.text).toContain("Gemini Models: Models within this group");
    expect(agyUsage("Not signed in.")).toBeNull();
    expect(agyUsage(JSON.stringify({ status: "SUCCESS", response: "" }))).toBeNull();
  });

  it("puts each group's shorter window first, keeping the groups in order", () => {
    const groups = groupLimits(agyUsage(AGY)!.limits);
    expect(groups.map((g) => [g.group, g.limits.map((l) => l.window)])).toEqual([
      ["Gemini Models", ["5h", "weekly"]],
      ["Claude and GPT models", ["5h"]],
    ]);
  });
});

describe("the files attached to a message", () => {
  it("shortens a long name on its card, keeping the extension", () => {
    expect(fileName("/Users/ana/Documents/plano.pdf")).toBe("plano.pdf");
    expect(fileName("C:\\Users\\ana\\plano.pdf")).toBe("plano.pdf");
    expect(shortName("plano.pdf")).toBe("plano.pdf");
    const short = shortName("relatorio-final-do-semestre-de-2026.pdf");
    expect(short).toBe("relatorio-final-do-….pdf");
    expect(short.length).toBe(24);
    expect(shortName("um-nome-muito-comprido-sem-extensao-nenhuma")).toBe("um-nome-muito-comprido-…");
  });

  it("carries the paths at the end of the message, and takes them back off", () => {
    const files = ["/tmp/a b/plano.pdf", "/tmp/notas.txt"];
    const sent = withFiles("Resuma estes arquivos", files);
    expect(sent).toBe("Resuma estes arquivos\n\n<attached-files>\n/tmp/a b/plano.pdf\n/tmp/notas.txt\n</attached-files>");
    expect(splitFiles(sent)).toEqual({ text: "Resuma estes arquivos", files });
    expect(splitFiles(withFiles("", files))).toEqual({ text: "", files });
    expect(withFiles("Só texto", [])).toBe("Só texto");
    expect(splitFiles("Só texto")).toEqual({ text: "Só texto" });
  });

  it("shows them as cards again when a conversation is read back", () => {
    const text = `<editor-context>\nSelected: sm5 (static-md) "Introdução".\n</editor-context>\n\n${withFiles("Use este texto", ["/tmp/texto.md"])}`;
    const t = fold([{ ev: "user", key: "u1", text }]);
    expect(t.items).toEqual([{ kind: "user", key: "u1", text: "Use este texto", context: "sm5 · Introdução", files: ["/tmp/texto.md"] }]);
  });
});
