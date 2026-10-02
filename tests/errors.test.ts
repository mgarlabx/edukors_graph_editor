/**
 * Errors in the interface's language: what the validator, the judgement and
 * the native side say reaches the screen in pt, en or es, while the English
 * the parity tests compare stays the script's and the server's.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pt from "../src/i18n/locales/pt.json";
import en from "../src/i18n/locales/en.json";
import es from "../src/i18n/locales/es.json";
import { setUiLang, translate } from "../src/i18n";
import { errorText } from "../src/i18n/errors";
import { RULE_CODES, ruleTemplate } from "../src/validate/rules";
import { diagnose, issueText, issueWhere } from "../src/validate";
import { schemaIssues } from "../src/schema/ajv";
import { judgeModel, NotJudged, readAnswers } from "../src/judge/pipeline";
import { syntaxErrorAt } from "../src/course/serialize";
import { clone, loadSample, SAMPLES } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type C = any;
const tables: Record<string, Record<string, string>> = { pt, en, es };
const slots = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

beforeAll(() => {
  vi.stubGlobal("document", { documentElement: { lang: "pt" } });
  setUiLang("pt");
});
afterAll(() => {
  setUiLang("pt");
  vi.unstubAllGlobals();
});

describe("the locales", () => {
  it("say every message of the validator in the three languages, with the same values", () => {
    for (const code of RULE_CODES) {
      expect(en[`rule.${code}` as keyof typeof en], code).toBe(ruleTemplate(code));
      for (const lang of ["pt", "es"]) expect(slots(tables[lang][`rule.${code}`] ?? ""), `${lang} ${code}`).toEqual(slots(ruleTemplate(code)));
    }
  });

  it("keep ai.php's words for the judgement in English", () => {
    for (const key of Object.keys(en).filter((k) => k.startsWith("ai.why."))) {
      const code = key.slice("ai.why.".length);
      const template = en[key as keyof typeof en];
      const self = Object.fromEntries(slots(template).map((s) => [s, `{${s}}`]));
      expect(new NotJudged(code as never, self).message, key).toBe(template);
    }
  });
});

describe("validation issues", () => {
  const broken = () => {
    const c = clone(loadSample(SAMPLES[0].path));
    delete c.info.author;
    c.edges.push({ from: c.nodes[0].id, to: "sm77" });
    c.nodes[0].title.push({ lang: "xx", text: "" });
    return c;
  };

  it("show in the interface's language and keep the script's English in the message", () => {
    const issues = diagnose(broken()).issues;
    const author = issues.find((i) => i.where === "info" && i.code === "rule.missing-field")!;
    expect(author.message).toBe("missing required field 'author'");
    expect(issueText(author)).toBe("falta o campo obrigatório 'author'");
    setUiLang("es");
    expect(issueText(author)).toBe("falta el campo obligatorio 'author'");
    setUiLang("en");
    expect(issueText(author)).toBe(author.message);
    setUiLang("pt");
  });

  it("say the words inside a message and the place it points to", () => {
    const issues = diagnose(broken()).issues;
    const empty = issues.find((i) => i.code === "rule.text-empty")!;
    expect(empty.message).toBe("empty title");
    expect(issueText(empty)).toBe("título sem texto");
    expect(issueWhere(empty)).toMatch(/^nó sm1\.title\[\d+\]$/);
    const edge = issues.find((i) => i.code === "rule.edge-to")!;
    setUiLang("es");
    expect(issueWhere(edge)).toBe(`arista ${edge.where.slice("edge ".length)}`);
    expect(issueText(edge)).toBe("'to' apunta a 'sm77', que no es un nodo");
    setUiLang("pt");
  });

  it("from the schema too, in English for the agent", () => {
    const c: C = clone(loadSample(SAMPLES[0].path));
    c.nodes[0].content.item = "not a list";
    const schema = schemaIssues(c);
    expect(schema.length).toBeGreaterThan(0);
    for (const i of schema) {
      expect(i.message).toBe(translate("en", i.code, i.params));
      expect(issueText(i)).toBe(translate("pt", i.code, i.params));
    }
  });
});

describe("judgement and native errors", () => {
  it("a refusal keeps ai.php's words and says them in the interface's language", () => {
    let refusal: unknown;
    try {
      readAnswers({}, "noul", [{ key: "ready" }]);
    } catch (e) {
      refusal = e;
    }
    expect((refusal as Error).message).toBe('question "ready" was not answered.');
    expect(errorText(refusal)).toBe('a pergunta "ready" não foi respondida.');
    expect(() => judgeModel("openai/gpt-latest")).toThrow('judge.model "openai/gpt-latest" is an alias, not a version.');
  });

  it("what the Rust side answers is said again when the editor knows it", () => {
    expect(errorText("/tmp/x.json: No such file or directory (os error 2)")).toBe("/tmp/x.json não existe (foi movido ou apagado?).");
    expect(errorText("/tmp/x.json: Permission denied (os error 13)")).toBe("Sem permissão para acessar /tmp/x.json.");
    expect(errorText("/tmp/x.json: Broken pipe (os error 32)")).toBe("Erro ao acessar /tmp/x.json (Broken pipe).");
    expect(errorText("/tmp/x.json: stream did not contain valid UTF-8")).toBe("/tmp/x.json não é um arquivo de texto UTF-8.");
    expect(errorText("no OpenRouter key in the Keychain")).toBe("Nenhuma chave da OpenRouter guardada. Adicione-a em Preferências.");
    expect(errorText(new NotJudged("refused", { error: "request failed (502)" }))).toBe("o pedido falhou (HTTP 502)");
    expect(errorText(new NotJudged("unreachable", { error: "no OpenRouter key in the Keychain" }))).toBe(
      "não foi possível falar com o modelo: Nenhuma chave da OpenRouter guardada. Adicione-a em Preferências.",
    );
    expect(errorText("something else")).toBe("something else");
  });

  it("broken JSON is located by line and column", () => {
    for (const text of ['{"a": 1,\n  "b": }', '{"a": [1, 2', '{"a": "x\\q"}', "{\n\n  'a': 1}", "[1, 2] 3", "", '{"a": tru}', '{"a": -}'])
      expect(() => JSON.parse(text)).toThrow();
    expect(syntaxErrorAt('{"a": 1,\n  "b": }')).toEqual({ line: 2, column: 8 });
    expect(syntaxErrorAt('{"a": [1, 2')).toEqual({ line: 1, column: 12 });
    expect(syntaxErrorAt('{"a": "x\\q"}')).toEqual({ line: 1, column: 10 });
    expect(syntaxErrorAt("{\n\n  'a': 1}")).toEqual({ line: 3, column: 3 });
    expect(syntaxErrorAt("[1, 2] 3")).toEqual({ line: 1, column: 8 });
    expect(syntaxErrorAt("")).toEqual({ line: 1, column: 1 });
    for (const sample of SAMPLES) expect(syntaxErrorAt(JSON.stringify(loadSample(sample.path), null, 2))).toBeNull();
    expect(syntaxErrorAt('{"a": [true, false, null, -1.5e3, "\\u00e9\\n"], "b": {}}')).toBeNull();
  });
});
