/**
 * The content editor's toolbar (src/inspector/markup.ts): what each command
 * writes and selects, in Markdown and in HTML; and the {{STORAGE: key}} a
 * prompt completes.
 */
import { describe, expect, it } from "vitest";
import { applyMarkup, storageQuery, storageRef, type Markup, type MarkupCommand } from "../src/inspector/markup";

/** Runs a command on a text whose selection is marked with [ and ], and marks the selection after it the same way. */
const run = (kind: Markup, command: MarkupCommand, marked: string) => {
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  const value = marked.replace("[", "").replace("]", "");
  const edit = applyMarkup(kind, command, value, start, end);
  const next = value.slice(0, edit.from) + edit.text + value.slice(edit.to);
  const [a, b] = edit.select;
  return `${next.slice(0, a)}[${next.slice(a, b)}]${next.slice(b)}`;
};

describe("Markdown", () => {
  it("bolds and unbolds the selection, without the blanks around it", () => {
    expect(run("markdown", "bold", "um [gato ]preto")).toBe("um **[gato]** preto");
    expect(run("markdown", "bold", "um **[gato]** preto")).toBe("um [gato] preto");
    expect(run("markdown", "bold", "um [**gato**] preto")).toBe("um [gato] preto");
    expect(run("markdown", "bold", "um []preto")).toBe("um **[]**preto");
  });

  it("writes italics with _, so that a bold is never taken for one", () => {
    expect(run("markdown", "italic", "um [gato]")).toBe("um _[gato]_");
    expect(run("markdown", "italic", "um **[gato]**")).toBe("um **_[gato]_**");
    expect(run("markdown", "italic", "um _[gato]_")).toBe("um [gato]");
  });

  it("turns the caret's line into a heading and back", () => {
    expect(run("markdown", "heading", "a\nGa[]tos\nb")).toBe("a\n## Gatos[]\nb");
    expect(run("markdown", "heading", "a\n## Ga[]tos\nb")).toBe("a\nGatos[]\nb");
    expect(run("markdown", "heading", "[]")).toBe("## []");
  });

  it("makes lists of the lines selected, leaving blank lines alone, and undoes them", () => {
    expect(run("markdown", "ul", "[um\n\ndois]\ntrês")).toBe("[- um\n\n- dois]\ntrês");
    expect(run("markdown", "ul", "[- um\n- dois]")).toBe("[um\ndois]");
    expect(run("markdown", "ol", "[um\ndois\ntrês]")).toBe("[1. um\n2. dois\n3. três]");
    expect(run("markdown", "ol", "[- um\n- dois]")).toBe("[1. um\n2. dois]");
    expect(run("markdown", "ul", "[1. um\n2. dois]")).toBe("[- um\n- dois]");
    expect(run("markdown", "ul", "[]")).toBe("- []");
  });

  it("leaves out the line after a selection that ends with a line break", () => {
    expect(run("markdown", "ul", "[um\n]dois")).toBe("[- um]\ndois");
  });

  it("writes links and images with the address to fill in", () => {
    expect(run("markdown", "link", "veja [o site] aqui")).toBe("veja [o site]([url]) aqui");
    expect(run("markdown", "link", "veja [] aqui")).toBe("veja [[]](url) aqui");
    expect(run("markdown", "image", "[um gato]")).toBe("![um gato]([url])");
    expect(run("markdown", "image", "[]")).toBe("![]([url])");
  });
});

describe("HTML", () => {
  it("wraps the selection in tags, and unwraps it", () => {
    expect(run("html", "bold", "um [gato]")).toBe("um <strong>[gato]</strong>");
    expect(run("html", "bold", "um <strong>[gato]</strong>")).toBe("um [gato]");
    expect(run("html", "italic", "[gato]")).toBe("<em>[gato]</em>");
    expect(run("html", "heading", "[Gatos]")).toBe("<h2>[Gatos]</h2>");
    expect(run("html", "paragraph", "[]")).toBe("<p>[]</p>");
  });

  it("makes a list item of each line selected, or an empty one to write in", () => {
    expect(run("html", "ul", "[um\n\ndois]")).toBe("[<ul>\n  <li>um</li>\n  <li>dois</li>\n</ul>]");
    expect(run("html", "ol", "x[]")).toBe("x<ol>\n  <li>[]</li>\n</ol>");
  });

  it("writes links and images with the address to fill in", () => {
    expect(run("html", "link", "[o site]")).toBe('<a href="[url]">o site</a>');
    expect(run("html", "link", "[]")).toBe('<a href="url">[]</a>');
    expect(run("html", "image", "[um gato]")).toBe('<img src="[url]" alt="um gato">');
  });
});

describe("{{STORAGE: key}} in a prompt", () => {
  it("finds the reference being typed before the caret, from {{ on", () => {
    expect(storageQuery("Use {{")).toEqual({ start: 4, text: "" });
    expect(storageQuery("Use {{STO")).toEqual({ start: 4, text: "" });
    expect(storageQuery("Use {{STORAGE: q1.pe")).toEqual({ start: 4, text: "q1.pe" });
    expect(storageQuery("{{q1")).toEqual({ start: 0, text: "q1" });
    expect(storageQuery("Use {{STORAGE: q1.percent}} and")).toBeNull();
    expect(storageQuery("no braces")).toBeNull();
  });

  it("writes the key picked", () => {
    expect(storageRef("f1.text")).toBe("{{STORAGE: f1.text}}");
  });
});
