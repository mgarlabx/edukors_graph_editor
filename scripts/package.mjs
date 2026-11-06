// Builds this system's installers (electron-builder.yml) into release/; extra arguments go to electron-builder (for
// example --dir for the unpacked app only, or --universal / --x64). Run scripts/build.mjs first. Locally the app is
// assembled in a temporary folder outside Dropbox, whose extended attributes break code signing; on CI it goes
// straight to release/ (with the unpacked app, the .yml and the blockmaps, which the release workflow uses).
// Nothing is published.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2).filter((a) => a !== "--no-bump");
const platform = { darwin: "--mac", win32: "--win", linux: "--linux" }[process.platform];
const release = resolve("release");
const out = process.env.CI ? release : await mkdtemp(join(tmpdir(), "edukors-graph-package-"));
try {
  execFileSync(process.execPath, [require.resolve("electron-builder/cli.js"), platform, "--publish", "never", `-c.directories.output=${out}`, ...args], { stdio: "inherit" });
  if (out !== release) {
    await mkdir(release, { recursive: true });
    for (const entry of await readdir(out, { withFileTypes: true })) {
      if (entry.isFile() && !entry.name.endsWith(".yml") && !entry.name.endsWith(".blockmap")) await copyFile(join(out, entry.name), join(release, entry.name));
      if (args.includes("--dir") && entry.isDirectory() && /unpacked|^mac/.test(entry.name)) await cp(join(out, entry.name), join(release, entry.name), { recursive: true, verbatimSymlinks: true });
    }
  }
  console.log("Installers in", release);
} finally {
  if (out !== release) await rm(out, { recursive: true, force: true });
}
