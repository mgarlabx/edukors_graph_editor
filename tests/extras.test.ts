/**
 * The extras editor's reading of what is typed: an object goes in as it is,
 * an empty text or {} takes the extras away (the format allows no empty ones),
 * and anything else is refused with a reason, in the interface's language.
 */
import { describe, expect, it } from "vitest";
import { parseExtras } from "../src/course/extras";
import pt from "../src/i18n/locales/pt.json";
import en from "../src/i18n/locales/en.json";
import es from "../src/i18n/locales/es.json";

describe("parseExtras", () => {
  it("keeps an object as it is, nested values included", () => {
    expect(parseExtras('{"acme-lms": {"id": 7, "tags": ["a", null]}}')).toEqual({
      ok: true,
      value: { "acme-lms": { id: 7, tags: ["a", null] } },
    });
  });

  it("takes an empty text, blanks or {} as no extras", () => {
    for (const text of ["", "  \n\t", "{}", "{\n  \n}"]) expect(parseExtras(text)).toEqual({ ok: true, value: undefined });
  });

  it("refuses what is not an object", () => {
    for (const text of ["[]", "[1]", "null", "3", '"x"', "true"]) {
      const r = parseExtras(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error).toBe(pt["extras.notObject"]);
    }
  });

  it("says where a syntax error is", () => {
    const r = parseExtras('{\n  "a": 1,\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/linha 3, coluna 1/);
  });

  it("has its strings in the three languages", () => {
    const keys = Object.keys(pt).filter((k) => k.startsWith("extras."));
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const k of keys) {
      expect(en, k).toHaveProperty([k]);
      expect(es, k).toHaveProperty([k]);
    }
  });
});
