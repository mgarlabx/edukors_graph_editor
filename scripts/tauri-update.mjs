#!/usr/bin/env node
/**
 * The latest.json that the 2.x versions (Tauri) read to offer an update
 * (https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/latest.json),
 * pointing at this release's own installers, so that whoever has a 2.x version gets this one
 * through the update notice they already know:
 *
 * - macOS: Edukors-Graph-Editor-<v>-mac-universal.app.tar.gz, the notarized .app (made by the
 *   release's Mac job); the 2.x updater puts it in place of the old app, same name and identifier.
 * - Windows: the NSIS installer, which first removes the 2.x install (build/installer.nsh).
 *   Installed from the Microsoft Store, the 2.x versions do not look here: the Store updates them.
 * - Linux: the AppImage (it replaces the old one) and the .deb (same package name, dpkg upgrades it).
 *
 * Each file needs its .sig next to it: the minisign signature with the 2.x updater's key
 * (`tauri signer sign`, secrets TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]), base64, as Tauri writes it.
 *
 *   node scripts/tauri-update.mjs <directory> <version> <tag>
 *
 * Writes <directory>/latest.json. Fails if a file or signature is missing.
 */
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [directory, version, tag] = process.argv.slice(2);
if (!directory || !/^\d+\.\d+\.\d+$/.test(version ?? "") || !tag) {
  console.error("usage: node scripts/tauri-update.mjs <directory> <version> <tag>");
  process.exit(2);
}

const prefix = "Edukors-Graph-Editor";
const files = {
  mac: `${prefix}-${version}-mac-universal.app.tar.gz`,
  windows: `${prefix}-${version}-setup.exe`,
  appimage: `${prefix}-${version}-linux-x86_64.AppImage`,
  deb: `${prefix}-${version}-linux-amd64.deb`,
};
const names = new Set(readdirSync(directory));
for (const file of Object.values(files)) {
  if (!names.has(file)) throw new Error(`Missing file: ${file}`);
  if (!names.has(`${file}.sig`)) throw new Error(`Missing signature: ${file}.sig`);
}

// Each signature is checked against the public key the 2.x versions were built with (src-tauri/tauri.conf.json →
// plugins.updater.pubkey in v2.20.0), as their updater will: a minisign Ed25519 signature of the file's BLAKE2b-512
// ("ED") or of the file itself ("Ed"), and the global signature over it and its trusted comment. A signature made with
// any other key would be refused by every 2.x install, so it stops the release here.
const PUBKEY = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDFERkM1RkZDMDMxNjY0OUYKUldTZlpCWUQvRi84SFlXVmd2bWV6LzhNVEdwV1d1eGk5Z1ExdEQvRTIzenNjN0sybkoxQU5qNW4K";
const lines = (b64) => Buffer.from(b64, "base64").toString("utf8").split("\n");
const pk = Buffer.from(lines(PUBKEY)[1], "base64"); // "Ed", key id (8), Ed25519 key (32)
const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pk.subarray(10, 42)]), format: "der", type: "spki" });
function checkSignature(file, signature) {
  const [, sigLine = "", trusted = "", globalLine = ""] = lines(signature);
  const sig = Buffer.from(sigLine, "base64"); // algorithm (2), key id (8), signature (64)
  if (sig.length !== 74 || !sig.subarray(2, 10).equals(pk.subarray(2, 10))) throw new Error(`${file}: signed with another key than the 2.x updater's`);
  const data = readFileSync(join(directory, file));
  const signed = sig.subarray(0, 2).toString() === "ED" ? createHash("blake2b512").update(data).digest() : data;
  if (!verify(null, signed, key, sig.subarray(10))) throw new Error(`${file}: the signature does not match the file`);
  const comment = Buffer.from(trusted.replace(/^trusted comment: /, ""));
  if (!verify(null, Buffer.concat([sig.subarray(10), comment]), key, Buffer.from(globalLine, "base64"))) throw new Error(`${file}: the signature's trusted comment does not match`);
}

const url = (file) => `https://github.com/mgarlabx/edukors_graph_editor/releases/download/${tag}/${encodeURIComponent(file)}`;
const entry = (file) => {
  const signature = readFileSync(join(directory, `${file}.sig`), "utf8").trim();
  checkSignature(file, signature);
  return { url: url(file), signature };
};
const notes = execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "release-notes.mjs"), version], { encoding: "utf8" }).trim();

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": entry(files.mac),
    "darwin-x86_64": entry(files.mac),
    "windows-x86_64": entry(files.windows),
    "linux-x86_64": entry(files.appimage),
    "linux-x86_64-deb": entry(files.deb),
  },
};
writeFileSync(join(directory, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
console.log(`latest.json for ${version}: ${Object.keys(latest.platforms).join(", ")}`);
