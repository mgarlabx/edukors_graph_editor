# Distribution: signing, notarization, installers and the Microsoft Store

From version 26.11.5 the editor is an Electron app on Edukors Common, packaged by
[electron-builder](https://www.electron.build) (`electron-builder.yml`). The published installers are built on
GitHub Actions by `.github/workflows/release.yml` when a version tag is pushed; locally, `npm run package` builds
this system's installers into `release/`.

| System | Installers | Signed by |
| --- | --- | --- |
| macOS 11+ (universal) | `.dmg` and `.zip` | Developer ID, notarized by Apple |
| Windows 10/11 (x64) | NSIS `-setup.exe`, per user; MSIX (`.appx`) for the Store | the Store signs the MSIX; the `.exe` is unsigned |
| Linux (x64) | AppImage and `.deb` | (nothing to sign) |

The identities are those of the 2.x versions (Tauri), so the new app installs over the old one: bundle identifier
`org.edukors.grapheditor` (macOS), MSIX identity `mgarlabx.EdukorsGraphEditor` with application id
`EdukorsGraphEditor` (Store), `.deb` package `edukors-graph-editor`. The app's own data now lives in Electron's
folder (`~/Library/Application Support/Edukors Graph Editor`, `%APPDATA%\Edukors Graph Editor`,
`~/.config/Edukors Graph Editor`); the 2.x folder (`org.edukors.grapheditor`) is read once, on the first start, and
left as it was (`src/main/legacy.ts`).

File associations: `.egrx` (the course file, `application/vnd.edukors.graph+zip`, UTI
`org.edukors.grapheditor.egrx`) and `.egf` (opened as an import, `application/vnd.edukors.graph+json`, UTI
`org.edukors.grapheditor.egf`, the one the 2.x versions declared).

## macOS

The Apple Developer account is an individual one: the developer macOS shows is **Mauricio Garcia**, Team ID
`GRVGLXMK3S`.

| Item | Where it is |
|---|---|
| Certificate *Developer ID Application: Mauricio Garcia (GRVGLXMK3S)*, valid until 2027-11-12 | The Keychain of whoever created it and, as a `.p12`, the password manager |
| App Store Connect API key (Team Key, Developer role), Key ID `A9CQQ9PA49` | The `.p8` in the password manager; Apple lets you download it only once |
| App Store Connect Issuer ID | **Users and Access → Integrations → Team Keys** |

electron-builder signs the app with the hardened runtime and `build/entitlements.mac.plist` (only JIT, which
Electron's JavaScript engine needs), and notarizes it when `APPLE_API_KEY` (the `.p8`'s path),
`APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set. `build/after-pack.cjs` takes out of `Info.plist` the camera,
microphone and Bluetooth descriptions Electron declares (the app uses none), and clears the extended attributes
Dropbox copies with the files, which break code signing. The release workflow also notarizes and staples the `.dmg`.

### On GitHub Actions

The repository secrets keep the names they had for Tauri:

| Secret | Content |
|---|---|
| `APPLE_CERTIFICATE` | the `.p12` in base64 (`base64 -i certificate.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_API_ISSUER` | the Issuer ID |
| `APPLE_API_KEY` | the Key ID |
| `APPLE_API_KEY_P8` | the content of the `.p8` |

(`APPLE_SIGNING_IDENTITY` is no longer used: electron-builder takes the identity from the `.p12`.) Without
`APPLE_CERTIFICATE` (in a fork), the Mac build is signed ad hoc, and Gatekeeper warns.

### On a Mac, by hand

```sh
security find-identity -v -p codesigning     # should list 1 valid identity
export APPLE_API_ISSUER="<Issuer ID>" APPLE_API_KEY_ID="A9CQQ9PA49" APPLE_API_KEY="$HOME/path/AuthKey_A9CQQ9PA49.p8"
node scripts/build.mjs --no-bump && node scripts/package.mjs --universal
codesign --verify --deep --strict --verbose=2 "release/mac-universal/Edukors Graph Editor.app"   # with --dir
spctl --assess --type execute --verbose "/Applications/Edukors Graph Editor.app"
```

`scripts/package.mjs` assembles the app in a temporary folder outside Dropbox and copies the installers to
`release/`. Without the `APPLE_API_*` variables the app is signed but not notarized. If the identity shows up in
`find-identity` but not as valid, Apple's intermediate certificate is missing: install `DeveloperIDG2CA.cer` from
`https://www.apple.com/certificateauthority/`.

### Renewing the certificate (before 2027-11-12)

Apps already signed keep opening after it expires (the signature is timestamped); only new builds need the new
certificate.

1. In Keychain Access, **Certificate Assistant → Request a Certificate From a Certificate Authority…**, saved to disk.
2. At developer.apple.com → **Certificates** → **+** → **Developer ID Application** (G2 Sub-CA), with that request.
3. Install the `.cer`, export it again as a `.p12` and update `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD`.

## Windows

The NSIS installer installs per user (`%LOCALAPPDATA%\Programs\edukors-graph-editor`), without asking for an
administrator, and opens the editor. It is not signed: SmartScreen warns "Windows protected your PC", and the person
goes on with **More info → Run anyway** (the teacher's guide, section 2, explains it). The signed way onto Windows
is the Microsoft Store.

`build/installer.nsh` first removes a 2.x version installed by its own installer (another folder, uninstall key
`Edukors Graph Editor`): its uninstaller runs silently, which closes the old app if open, removes only the shortcuts
that point to it and keeps its data for the migration. The release workflow checks this on every run: it installs
the real v2.20.0 installer, then the new one, and checks that 2.20 is gone, its data kept and the new app and its
Start menu shortcut there.

### Microsoft Store

The same app is published in the Microsoft Store as an **MSIX** package (electron-builder's `appx` target), which
the Store signs once it passes certification. Its updates come through the Store.

- Identity from Partner Center (**Product management → Product identity**): name `mgarlabx.EdukorsGraphEditor`,
  publisher `CN=25CB0A95-E013-4D6C-9667-81DF1CC50F46`, display name `mgarlabx`. The version is the app's with a
  fourth number 0 (`26.11.5.0`), above the 2.x packages', so the Store updates them in place. Inside the package,
  `%APPDATA%` is virtualized per package, so the 2.x data is where the migration looks for it.
- Tiles in `build/appx/`, made from `build/icon.png` by `python3 scripts/appx-tiles.py`.
- Full-trust desktop app (`runFullTrust`, a restricted capability to justify in **Submission options**). Three
  languages (pt-BR, en-US, es-ES), each with its Store listing. The privacy policy is given as text in Partner Center
  (**Properties**). In **Properties → Product declarations**, *"This product incorporates generative AI features…"*
  must stay checked (policy 11.16).

The release workflow sends each final version to the Store itself, once the GitHub release is out
(`.github/workflows/store.yml`, the **store** job of `release.yml`), with the
[Microsoft Store Developer CLI](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/overview):
it takes the run's **store-msix** artifact and makes a new submission of the app (Store ID `9N0N0P3GVRCK`) with
that package, the listings unchanged. With the repository variable `STORE_AUTO_SUBMIT` set to `true` (**Settings →
Secrets and variables → Actions → Variables**) it is submitted for certification at once; otherwise it is left as a
draft (**Submit for certification** by hand in Partner Center). Partner Center takes one submission at a time: while
one is in certification, the job fails, and is run again later. By hand, **Actions → Microsoft Store → Run
workflow** checks the credentials (`check_only`), or sends the package of another Release run (`run_id`).

The CLI signs in to Partner Center as the Microsoft Entra application **GitHub Actions - Edukors Store** (tenant
`Solvertank.onmicrosoft.com`), with the **Manager (Windows)** role. Its four values are repository secrets:
`PARTNER_CENTER_TENANT_ID`, `PARTNER_CENTER_CLIENT_ID`, `PARTNER_CENTER_SELLER_ID` and
`PARTNER_CENTER_CLIENT_SECRET`. When the key expires, a new one is made on the application's page in Partner Center
(**Keys → Add new key**) and replaces the secret.

## Linux

An **AppImage** (one file, runs without installing) and a **.deb** (Debian, Ubuntu, Mint and relatives), which
installs the app in `/opt/Edukors Graph Editor`, the `edukors-graph-editor` command, the menu entry and the `.egrx`
and `.egf` types. The `.deb` keeps the 2.x package name, so it upgrades a 2.x install (checked by the release
workflow on every run, over the real v2.20.0 `.deb`). x64 only; there is nothing to sign.

## Updates

**From 26.11.5 on**, Common's update notice reads the latest GitHub release (`package.json → edukors.updates`) and,
when there is a newer version, says so with a link to the download; it installs nothing by itself. From the
Microsoft Store, the Store updates the app.

**The 2.x versions** (Tauri) are no longer offered updates. Their updater reads
`releases/latest/download/latest.json`, which only v26.11.5 carries; once a later release is the latest, the 2.x
updater finds nothing. Whoever still has 2.x installs the current version by hand: `build/installer.nsh` removes the
old Windows install, the `.deb` upgrades the 2.x package, and the 2.x data is read on the first start.

## Releasing a version

Versions are numbered by date, `YY.M.D` (Common's rule); the app shows `v.YY.MM.DD`.

1. `node scripts/build.mjs` writes today's date to `package.json` (`--version=X.Y.Z` for a second release on the
   same day). Run `npm install --package-lock-only` (or edit the lockfile's two `version` fields) so the lockfile
   follows.
2. Write the version's section in `CHANGELOG.md` (`## 26.11.5`), **always in English**: it becomes the release notes.
3. Commit, open a pull request and wait for CI and the Release workflow's checks (packaging, the installs over 2.20).
   Merge.
4. `git tag v26.11.5 && git push origin v26.11.5`. The Release workflow checks the tag against `package.json`, builds
   and notarizes, publishes the release with all the installers, the fixed-name copies and `SHA256SUMS.txt` (with build provenance), and then sends the MSIX to the Store. It takes 30 to 50
   minutes, most of it Apple's notarization.

A tag `vX.Y.Z-rc.N` makes a pre-release, without the Store: `releases/latest` ignores it,
so no installed app sees it.

The release notes come from `CHANGELOG.md` at the tag; a section changed afterwards does not reach the release page.

### Download links

These always download the latest published version:

- Mac (Apple Silicon and Intel): `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-mac.dmg`
- Windows (x64), Microsoft Store: `https://apps.microsoft.com/detail/9N0N0P3GVRCK`
- Windows (x64), installer: `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-windows.exe`
- Linux (x64), AppImage: `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.AppImage`
- Linux (x64), Debian/Ubuntu: `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.deb`

They are copies, with names without the version, of each release's installers (`scripts/public-installers.mjs`);
the Slides Editor follows the same convention with its own prefix.

## The AI assistant and accounts

The assistant is Common's: it drives the Claude Code or Codex the person installed (the SDK's own `claude` binaries
are left out of the package), with AI accounts the person signs in to. The Agent SDK documentation says: *"Unless
previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for
their products, including agents built on the Claude Agent SDK."* Handing the app to other people at scale may call
for API key authentication or Anthropic's approval.
