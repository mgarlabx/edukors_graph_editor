/**
 * What the interface writes differently off the Mac (src/app/os.ts): the
 * shortcuts and a file's name in its path, on a Mac and on Windows.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const on = async (platform: string) => {
  vi.resetModules();
  vi.stubGlobal("navigator", { platform });
  return import("../src/app/os");
};

afterEach(() => vi.unstubAllGlobals());

describe("on a Mac", () => {
  it("keeps the Mac's symbols", async () => {
    const { keyLabel } = await on("MacIntel");
    expect(keyLabel("⇧⌘S")).toBe("⇧⌘S");
    expect(keyLabel("desfeita com ⌘Z.")).toBe("desfeita com ⌘Z.");
  });

  it("names a file by what follows the last slash only", async () => {
    const { baseName, folderName } = await on("MacIntel");
    expect(baseName("/Users/ana/cursos/a\\b.egf")).toBe("a\\b.egf");
    expect(folderName("/Users/ana/cursos/a.egf")).toBe("cursos");
  });
});

describe("on Windows", () => {
  it("writes shortcuts with Ctrl, Alt and Shift, in labels and in sentences", async () => {
    const { keyLabel } = await on("Win32");
    expect(keyLabel("⌘N")).toBe("Ctrl+N");
    expect(keyLabel("⇧⌘S")).toBe("Ctrl+Shift+S");
    expect(keyLabel("⌥⌘0")).toBe("Ctrl+Alt+0");
    expect(keyLabel("⌘,")).toBe("Ctrl+,");
    expect(keyLabel("⌃⇥ / ⌃⇧⇥")).toBe("Ctrl+Tab / Ctrl+Shift+Tab");
    expect(keyLabel("⌘1 … ⌘9")).toBe("Ctrl+1 … Ctrl+9");
    expect(keyLabel("⇧↵")).toBe("Shift+Enter");
    expect(keyLabel("⌫")).toBe("Delete");
    expect(keyLabel("pode ser desfeita com ⌘Z.")).toBe("pode ser desfeita com Ctrl+Z.");
    expect(keyLabel("Esc")).toBe("Esc");
  });

  it("leaves a symbol that names the key alone, and converts a guide's table rows", async () => {
    const { keyLabel } = await on("Win32");
    expect(keyLabel("No Windows, ⌘ e ⌃ correspondem a Ctrl, ⌥ a Alt e ⇧ a Shift.")).toBe("No Windows, ⌘ e ⌃ correspondem a Ctrl, ⌥ a Alt e ⇧ a Shift.");
    expect(keyLabel("| ⌘N / ⌘O / ⌘S / ⇧⌘S | Novo |")).toBe("| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | Novo |");
    expect(keyLabel("(⌥⌘0) abre")).toBe("(Ctrl+Alt+0) abre");
  });

  it("names a file by what follows the last slash or backslash", async () => {
    const { baseName, folderName } = await on("Win32");
    expect(baseName("C:\\Users\\ana\\cursos\\curso.egf")).toBe("curso.egf");
    expect(folderName("C:\\Users\\ana\\cursos\\curso.egf")).toBe("cursos");
    expect(baseName("C:/Users/ana/curso.egf")).toBe("curso.egf");
  });
});
