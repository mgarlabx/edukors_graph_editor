#!/usr/bin/env node
/**
 * The Windows app as an MSIX package, for the Microsoft Store, from what the
 * release's Windows build left behind (`tauri build`, the same build the
 * NSIS installer comes from):
 *
 *   node scripts/make-msix.mjs            (on Windows, after the build)
 *
 * It puts the app (src-tauri/target/release/edukors-editor.exe), the agent
 * (src-tauri/agent-bundle/, which the app looks for next to itself, as in the
 * installed copy) and the Store's icons in src-tauri/target/msix/, writes the
 * AppxManifest.xml, and packs it with the Windows SDK's makeappx into
 * src-tauri/target/Edukors-Graph-Editor-<version>.msix.
 *
 * The package goes unsigned: the Store signs it once it passes certification.
 * Its identity is the one Partner Center gave the app (Product management →
 * Product identity), and the Store takes no other. Installed from the Store,
 * the app leaves the updates to it (store_install in src-tauri/src/lib.rs).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Partner Center → Product identity. */
const IDENTITY = {
  name: "mgarlabx.EdukorsGraphEditor",
  publisher: "CN=25CB0A95-E013-4D6C-9667-81DF1CC50F46",
  publisherDisplayName: "mgarlabx",
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAURI = join(ROOT, "src-tauri");
const RELEASE = join(TAURI, "target", "release");
const OUT = join(TAURI, "target", "msix");
const EXE = "edukors-editor.exe";

const conf = JSON.parse(readFileSync(join(TAURI, "tauri.conf.json"), "utf8"));
// The Store wants four numbers, the last one 0.
const version = `${conf.version}.0`;

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The newest makeappx of the Windows SDK. */
function makeappx() {
  const bin = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  const versions = existsSync(bin) ? readdirSync(bin).filter((v) => /^10\.\d+\.\d+\.\d+$/.test(v)) : [];
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
  for (const v of versions) {
    const tool = join(bin, v, "x64", "makeappx.exe");
    if (existsSync(tool)) return tool;
  }
  throw new Error(`no makeappx.exe in ${bin}: is the Windows SDK installed?`);
}

for (const needed of [join(RELEASE, EXE), join(TAURI, "agent-bundle")]) {
  if (!existsSync(needed)) throw new Error(`${needed} is missing: build the app first (tauri build --config src-tauri/tauri.bundle.conf.json)`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "Assets"), { recursive: true });
cpSync(join(RELEASE, EXE), join(OUT, EXE));
cpSync(join(TAURI, "agent-bundle"), join(OUT, "agent"), { recursive: true });
for (const icon of ["StoreLogo", "Square44x44Logo", "Square150x150Logo"]) {
  cpSync(join(TAURI, "icons", `${icon}.png`), join(OUT, "Assets", `${icon}.png`));
}

// The first language is the package's own; the Store asks for a listing in each.
// A full-trust desktop app (runFullTrust): the editor reads and writes courses
// wherever the person keeps them, and the agent runs Node and Claude Code.
writeFileSync(
  join(OUT, "AppxManifest.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="${xml(IDENTITY.name)}" Publisher="${xml(IDENTITY.publisher)}" Version="${version}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>${xml(conf.productName)}</DisplayName>
    <PublisherDisplayName>${xml(IDENTITY.publisherDisplayName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="pt-BR" />
    <Resource Language="en-US" />
    <Resource Language="es-ES" />
  </Resources>
  <Applications>
    <Application Id="EdukorsGraphEditor" Executable="${EXE}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="${xml(conf.productName)}"
        Description="${xml(conf.bundle.longDescription)}"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png" />
      <Extensions>
        <uap:Extension Category="windows.fileTypeAssociation">
          <uap:FileTypeAssociation Name="egf">
            <uap:DisplayName>Edukors Graph Course</uap:DisplayName>
            <uap:SupportedFileTypes>
              <uap:FileType ContentType="application/vnd.edukors.graph+json">.egf</uap:FileType>
            </uap:SupportedFileTypes>
          </uap:FileTypeAssociation>
        </uap:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
`,
);

const msix = join(TAURI, "target", `Edukors-Graph-Editor-${conf.version}.msix`);
execFileSync(makeappx(), ["pack", "/d", OUT, "/p", msix, "/o", "/h", "SHA256"], { stdio: "inherit" });
console.log(msix);
