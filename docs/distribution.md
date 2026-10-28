# Distribution: signing, notarization and installers

`npm run app:build` builds the universal app (Apple Silicon and Intel) in `src-tauri/target/universal-apple-darwin/release/bundle/`:

- `macos/Edukors Graph Editor.app` — the application;
- `dmg/Edukors Graph Editor_<version>_universal.dmg` — the disk image.

The Mac app is signed with the **Developer ID Application** certificate and notarized by Apple: downloaded from the browser, it opens with only the standard "this is an app downloaded from the Internet" question, without a trip to **System Settings → Privacy & Security**.

## What is configured

- `src-tauri/tauri.conf.json` → `bundle.macOS.hardenedRuntime: true` (required by notarization) and `minimumSystemVersion: "11.0"`. `signingIdentity` stays `null` in the file: the identity comes from the `APPLE_SIGNING_IDENTITY` variable, and whoever lacks the certificate still builds the app, unsigned.
- The `.egf` file association (Edukors Graph Format, `bundle.fileAssociations`), with the *Editor* role and *Owner* rank, and the exported type `org.edukors.grapheditor.egf` (conforming to `public.json`): double-clicking an `.egf` opens the editor.
- A `.json` association with the *Alternate* rank, so that older courses show up under **Open With** without taking the place of the default JSON editor.
- The identifier `org.edukors.grapheditor`.

## Mac signing and notarization

The Apple Developer account is an individual one: the developer macOS shows is **Mauricio Garcia**, Team ID `GRVGLXMK3S`.

| Item | Where it is |
|---|---|
| Certificate *Developer ID Application: Mauricio Garcia (GRVGLXMK3S)*, valid until 2027-11-12 | The Keychain of whoever created it and, as a `.p12`, the password manager |
| App Store Connect API key (Team Key, Developer role), Key ID `A9CQQ9PA49` | The `.p8` in the password manager; Apple lets you download it only once |
| App Store Connect Issuer ID | **Users and Access → Integrations → Team Keys** |

Tauri signs the `.app` and notarizes it with the API key when these variables are set. The updater's `.app.tar.gz` is made from the notarized `.app`. The `.dmg`, however, Tauri only signs: notarizing it is a separate step (`notarytool` and `stapler`, below).

The app carries no `claude` binary (the person's own Claude Code is used), so there is nothing of Anthropic's to sign or notarize.

### On GitHub Actions

The Mac job in `.github/workflows/release.yml` reads these repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Content |
|---|---|
| `APPLE_CERTIFICATE` | the `.p12` in base64 (`base64 -i certificate.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Mauricio Garcia (GRVGLXMK3S)` |
| `APPLE_API_ISSUER` | the Issuer ID |
| `APPLE_API_KEY` | the Key ID |
| `APPLE_API_KEY_P8` | the content of the `.p8` |

With them, the workflow writes the `.p8` to a temporary file, Tauri signs and notarizes the app, a following step notarizes and staples the `.dmg` and replaces the copy `tauri-action` put in the draft, and the final check runs the app and the `.dmg` through Gatekeeper. Without `APPLE_CERTIFICATE` (in a fork, for example), the build goes on unsigned, with a warning.

### On a Mac, by hand

With the certificate in the Keychain:

```sh
security find-identity -v -p codesigning     # should list 1 valid identity

export APPLE_SIGNING_IDENTITY="Developer ID Application: Mauricio Garcia (GRVGLXMK3S)"
export APPLE_API_ISSUER="<Issuer ID>"
export APPLE_API_KEY="A9CQQ9PA49"
export APPLE_API_KEY_PATH="$HOME/path/AuthKey_A9CQQ9PA49.p8"
npm run app:build
```

On the first signature, macOS asks for the login password so that `codesign` can use the key: **Always Allow**. If the identity shows up in `find-identity` but not as valid (`0 valid identities found`), Apple's intermediate certificate is missing: install `DeveloperIDG2CA.cer` from `https://www.apple.com/certificateauthority/` (double-click).

Then notarize the `.dmg` and check:

```sh
B=src-tauri/target/universal-apple-darwin/release/bundle
DMG="$B/dmg/Edukors Graph Editor_<version>_universal.dmg"
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"

codesign --verify --deep --strict --verbose=2 "$B/macos/Edukors Graph Editor.app"
spctl --assess --type execute --verbose "$B/macos/Edukors Graph Editor.app"            # Notarized Developer ID
spctl --assess --type open --context context:primary-signature --verbose "$DMG"       # Notarized Developer ID
syspolicy_check distribution "$B/macos/Edukors Graph Editor.app"
```

If notarization is rejected, the reason is in `xcrun notarytool log <id> --key … --key-id … --issuer …`.

### Renewing the certificate (before 2027-11-12)

Apps already signed keep opening after it expires (the signature is timestamped); only new builds need the new certificate.

1. In Keychain Access, **Certificate Assistant → Request a Certificate From a Certificate Authority…**, saved to disk.
2. At developer.apple.com → **Certificates** → **+** → **Developer ID Application** (G2 Sub-CA), with that request. Only the account holder can create it.
3. Install the `.cer`, export it again as a `.p12` and update `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD`. The identity (name and Team ID) does not change.

## Intel and Apple Silicon

The default build is for the machine's architecture (`aarch64` on an Apple Silicon Mac). For a universal binary:

```sh
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npx tauri build --target universal-apple-darwin
```

## Entitlements

The app needs no special entitlements: it reads and writes only the files the user picks in the dialogs, uses the user's own Keychain and makes HTTPS requests only to `openrouter.ai`. The AI agent is another process (Node, driving the person's own Claude Code or another agent's CLI), which talks to that agent's service. Should it ever be distributed through the Mac App Store (sandboxed), `com.apple.security.files.user-selected.read-write` and `com.apple.security.network.client` would have to be added.

## The AI agent

The agent's process ships inside the app: `src-tauri/agent-bundle/` (the `agent/` and the `node_modules` it uses: the Agent SDK's JavaScript, without its native `claude` packages, the MCP SDK and zod, ≈ 56 MB) goes in as a resource through `src-tauri/tauri.bundle.conf.json` and lands in `Contents/Resources/agent/` on the Mac. `src-tauri/src/agent.rs` looks for the script there first and, if it is not there (in `npm run app:dev`), in the project folder. Node does not ship with it: the app uses the computer's own (18 or newer, looked for in the `PATH`, in the version managers and in the usual install locations), and the panel says so when it cannot find it. What has been solved and what still needs attention:

1. ~~Include `agent/` and the `node_modules` it uses (`@anthropic-ai/claude-agent-sdk`, the binary's package `@anthropic-ai/claude-agent-sdk-darwin-arm64`, ≈ 230 MB, and `zod`) in `bundle.resources`, with the Claude Code binary signed along with the app for notarization; or compile the process into a single executable (the SDK documents `bun build --compile` with `extractFromBunfs`).~~ Done, with `agent-bundle/`. It no longer carries the `claude` binaries: the SDK drives the Claude Code the person installed, like the other agents' CLIs, so a new Claude Code no longer needs a new editor.
2. Require Node on the teacher's computer, or ship it. Today it is required (README and teacher's guide, section 12).
3. **Change the authentication.** Today the agent uses the Claude Code login of the Mac itself (the Claude account). The Agent SDK documentation says: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead."* To hand the app to other people, the way is an Anthropic API key (kept in the Keychain, like the OpenRouter one, and passed to the agent's process as `ANTHROPIC_API_KEY`), or Anthropic's approval.

## Windows

The Windows installer (NSIS, `Edukors Graph Editor_<version>_x64-setup.exe`) can only be built on Windows. It is made on GitHub Actions, along with the Mac app, by the release workflow (see [Releases and automatic updates](#releases-and-automatic-updates)). On a Windows machine with Rust (MSVC) and Node 22, the same comes out of `npm ci && npm run app:build:win`, in `src-tauri/target/release/bundle/nsis/`.

- `src-tauri/tauri.windows.conf.json`, which Tauri reads only on Windows, swaps `app`/`dmg` for NSIS, installs per user (without asking for an administrator) and associates only `.egf` with the editor: Windows has no "Alternate" like the Mac, and associating `.json` would take over all of the user's `.json` files.
- The agent ships with it, as on the Mac, without `claude.exe`: Claude Code is the person's own install (the native installer's `%USERPROFILE%\.local\bin\claude.exe`, or npm's, whose `.cmd` shim is looked through). Node is still the user's own; `agent.rs` looks for it in the PATH and where the official installer, nvm-windows, fnm, Volta and Scoop put it.
- The OpenRouter key goes in the Windows Credential Manager.
- An `.egf` opened from Explorer while the editor is already open goes to the open window (`tauri-plugin-single-instance`).
- x64 only. The installer is not signed: SmartScreen warns "Windows protected your PC", and the person goes on with **More info → Run anyway** (the walkthrough for teachers is in the guide, section 2, in the three languages). The signed way onto Windows is the Microsoft Store, below. Signing the installer itself would take a code signing certificate (OV, with the key in a cloud signing service), set in `bundle.windows.signCommand`; Azure Artifact Signing (formerly Trusted Signing) does not issue certificates to Brazilian organizations.

### Microsoft Store

The same Windows app is also published in the Microsoft Store, as an **MSIX** package. The Store signs the package once it passes certification, so the app installs from the Store with no SmartScreen warning and no certificate of our own. Its updates come through the Store, not through the app's updater.

- `scripts/make-msix.mjs`, run by the Windows job of the release workflow after the build, puts the app (`src-tauri/target/release/edukors-editor.exe`), the agent (`src-tauri/agent-bundle/`, as `agent/` next to the app, where `agent.rs` finds it as in the installed copy) and the Store icons in `src-tauri/target/msix/`, writes `AppxManifest.xml` and packs it with the Windows SDK's `makeappx`. The package is uploaded as the run's artifact **microsoft-store-msix** (**Actions → Release → the run → Artifacts**), not to the release: unsigned, it installs only from the Store.
- The package's identity is the one Partner Center gave the app (**Product management → Product identity**), in `IDENTITY` at the top of the script: name `mgarlabx.EdukorsGraphEditor`, publisher `CN=25CB0A95-E013-4D6C-9667-81DF1CC50F46`, publisher display name `mgarlabx`. The Store takes no other. The version is the app's with a fourth number, always 0 (`2.14.0.0`).
- It is a full-trust desktop app (`runFullTrust`, a restricted capability the Store asks to justify in **Submission options**): it reads and writes courses wherever the person keeps them, keeps the key in the Credential Manager and runs Node and the agent's CLI (Claude Code or another) for the agent. It associates `.egf` with the editor and declares three languages (pt-BR, en-US, es-ES), each needing its own Store listing.
- Installed from the Store, the app knows it is running inside a package (`store_install` in `src-tauri/src/lib.rs`, through `GetCurrentPackageFullName`) and leaves the updates to the Store: the updater plugin is not loaded, **Check for updates…** leaves the Help menu and the automatic check leaves the Preferences (`fromStore` in `src/app/updates.ts`). The NSIS installer's copy is unchanged.
- The privacy policy the Store requires is given as text in Partner Center (**Properties**), not as a URL.
- The app generates content with AI (the agent and the OpenRouter calls), so in **Properties → Product declarations** the box *"This product incorporates generative AI features…"* must be checked; without it, certification fails under policy 11.16 (Live Generative AI Content).

The release workflow sends each new version to the Store itself (`.github/workflows/store.yml`, the **store** job of `release.yml`), with the [Microsoft Store Developer CLI](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/overview) (`msstore`). Once the builds are through (whatever became of the Mac's), it takes the run's **microsoft-store-msix** and makes a new submission of the app (Store ID `9N0N0P3GVRCK`) with that package, the listings unchanged, and leaves it as a **draft** in Partner Center, as the GitHub release is left as a draft. To send it on:

1. In Partner Center (**Apps and games → Edukors Graph Editor**), open the draft submission and check **Packages**: the new `.msix` is there.
2. **Submit for certification.** Certification takes from a few hours to three business days; the update then reaches the installed copies through the Store.

With the repository variable `STORE_AUTO_SUBMIT` set to `true` (**Settings → Secrets and variables → Actions → Variables**), the job submits for certification itself. Partner Center takes one submission at a time: while one is in certification, the job fails, and is run again later. By hand, **Actions → Microsoft Store → Run workflow** checks that the credentials reach Partner Center (`check_only`), or sends the package of another Release run (`run_id`).

The CLI signs in to Partner Center as an application of the Microsoft Entra tenant associated with the account (`Solvertank.onmicrosoft.com`), **GitHub Actions - Edukors Store**, with the **Manager (Windows)** role (**Account settings → User management → Microsoft Entra applications**). Its four values are repository secrets: `PARTNER_CENTER_TENANT_ID`, `PARTNER_CENTER_CLIENT_ID`, `PARTNER_CENTER_SELLER_ID` (**Account settings → Legal info**) and `PARTNER_CENTER_CLIENT_SECRET`, the application's key, which Partner Center shows only once. When the key expires (see **Certificates & secrets** of the application in entra.microsoft.com), a new one is made on the application's page in Partner Center (**Keys → Add new key**) and replaces the secret. Without the secrets, the job does nothing.

Sending a version by hand is still possible: download the run's **microsoft-store-msix** artifact, start a new submission in Partner Center (**Update** on the current one), upload the `.msix` in **Packages**, remove the old one, and submit.

## Linux

The Linux version comes in two formats: an **AppImage** (a single file, which runs on almost every distribution, without installing) and a **.deb** (Debian, Ubuntu, Mint, Pop!_OS and relatives). Both are built on GitHub Actions, on Ubuntu 22.04, along with the other systems: what is compiled against its glibc also runs on newer distributions. On Linux with Rust, Node 22 and Tauri's libraries (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libssl-dev`, `libdbus-1-dev`, `patchelf`), the same comes out of `npm ci && npm run app:build:linux`, in `src-tauri/target/release/bundle/appimage/` and `deb/`.

- `src-tauri/tauri.linux.conf.json`, which Tauri reads only on Linux, swaps `app`/`dmg` for `deb` and `appimage` and, as on Windows, associates only `.egf`. The `.deb` also installs `src-tauri/linux/edukors-graph-editor.xml`, which teaches the system what an `.egf` is (`application/vnd.edukors.graph+json`); without it, the file manager does not know to open it with the editor. The menu entry comes from `src-tauri/linux/edukors-graph-editor.desktop`, not from Tauri's template, which does not pass the file (`%F`) to the editor. The AppImage does not integrate with the system: it has no file association and no menu entry, unless the person uses something like AppImageLauncher.
- The agent ships with it, without `claude`: Claude Code is the person's own install. Node is still the user's own; `agent.rs` looks for it in the PATH, in the version managers, in Linux's Homebrew and in `/usr/bin`. To sign in to Claude Code or OpenCode, the panel opens the system's terminal: `x-terminal-emulator` (Debian/Ubuntu) and, failing that, GNOME Terminal, Konsole, Xfce Terminal or xterm (`agent/terminal.mjs`).
- The OpenRouter key goes in the desktop's keyring (GNOME Keyring, KWallet), through the Secret Service. Without a running keyring (in a minimal window manager, for example), the editor cannot store the key.
- An `.egf` opened from the file manager while the editor is already open goes to the open window (`tauri-plugin-single-instance`, as on Windows).
- x64 only. There is no signing to do: on Linux, trust comes from where the file is downloaded, and the `.deb` does not go through a repository (`apt`). Installing the `.deb` asks for the administrator password; the AppImage does not.
- Updates: the AppImage replaces itself. Whoever installed the `.deb` gets the new `.deb`, which the app installs with `dpkg -i` and which therefore asks for the administrator password (`linux-x86_64-deb` in `latest.json`, which the updater looks for before `linux-x86_64`).

## Releases and automatic updates

The app looks for new versions in the GitHub releases (`tauri-plugin-updater`, configured in `plugins.updater` of `src-tauri/tauri.conf.json`). On opening, it checks quietly, at most once a day, and only if **Check for updates automatically** is on in the Preferences. The **Check for updates…** item is in the app menu (Mac) or the Help menu (Windows and Linux) and always answers. Before downloading, the app asks about unsaved courses and stops the agent. On the Mac and with Linux's AppImage, the new app replaces the old one and the editor restarts; the `.deb` is installed again with the administrator password. On Windows, the app closes, the installer runs without questions (`passive` mode, per user, without asking for an administrator) and opens the editor again. Code: `src/app/updates.ts` and `src/app/UpdateModal.tsx`. A copy installed from the Microsoft Store does none of this: the Store updates it ([Microsoft Store](#microsoft-store)).

Each update is checked with the updater's own key, independent of the Apple and Windows certificates. **If the private key is lost, installed apps can no longer update themselves** and everyone would have to reinstall by hand.

### Preparing the key (once)

```sh
npx tauri signer generate -w ~/.tauri/edukors-updater.key
```

1. Set a password and keep the key and the password in a password manager.
2. Copy the content of `~/.tauri/edukors-updater.key.pub` to `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. While the field says `PENDENTE`, the release workflow fails right at the start.
3. In the repository's **Settings → Secrets and variables → Actions**, create `TAURI_SIGNING_PRIVATE_KEY` (the content of `~/.tauri/edukors-updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

### Releasing a version

1. Write the version's section in `CHANGELOG.md` (`## 2.12.0`), **always in English**. That text goes to the release page and to the notice inside the app, the same for every interface language.
2. `node scripts/bump-version.mjs 2.12.0`: updates the version in `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`. Commit and push.
3. `git tag v2.12.0 && git push origin v2.12.0`.
4. The `.github/workflows/release.yml` workflow checks the tag and the versions, creates a draft release and builds, in parallel, the universal Mac app (`.dmg` and `.app.tar.gz`), the Windows installer, and Linux's AppImage and `.deb`, each with its `.sig` signature. Each installer is also uploaded a second time, under a fixed name, for the download links (below). The Windows job also leaves the Microsoft Store's `.msix` among the run's artifacts, which the **store** job sends to Partner Center as a draft submission. Finally, it writes `latest.json` with the platforms (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, `linux-x86_64` and `linux-x86_64-deb`). It takes 15 to 25 minutes.
5. Review the draft and click **Publish**. Only then does `latest.json` take effect under `releases/latest/download/`, and the installed apps see the new version.
6. In Partner Center, submit the draft the workflow left with the new `.msix` ([Microsoft Store](#microsoft-store)).

**Do not edit the notes in the draft**: `latest.json` has already been written with the text from `CHANGELOG.md`, and the change does not reach the app. To fix it, delete the draft and the tag, fix `CHANGELOG.md` and repeat.

To build the app locally without the key, nothing changes: `npm run app:build` does not create the updater's files. They are created only when the build also gets `--config src-tauri/tauri.release.conf.json`, which requires `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the environment.

### Download links

For a website or an email, these links always download the installer of the latest published version:

- Mac (Apple Silicon and Intel): `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-mac.dmg`
- Windows (x64), Microsoft Store: `https://apps.microsoft.com/detail/9N0N0P3GVRCK`
- Windows (x64), installer: `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-windows.exe`
- Linux (x64), AppImage: `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.AppImage`
- Linux (x64), Debian/Ubuntu: `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.deb`

The GitHub ones are copies, with names without the version, of each release's `.dmg`, `.exe`, AppImage and `.deb`. The Linux ones exist from the first version with Linux on. v2.12.0 came out before them and does not have them: the links work from the following version on. The page with all the files is `https://github.com/mgarlabx/edukors_graph_editor/releases/latest`.

The Slides Editor follows the same public naming convention, using `Edukors-Slides-Editor` as its prefix. Both GitHub workflows leave releases in draft for manual review. The `_code2` download pages prefer fixed names and fall back to versioned installers for older releases; missing installers link to the releases page instead of leaving an empty card. Updater manifests and signed original assets keep their existing names.

### Testing

`releases/latest/download/` ignores drafts and pre-releases: a pre-release in the main repository is not found by the app. To test end to end, use a fork, with `plugins.updater.endpoints` pointing to its releases, and the workflow triggered by hand (**Actions → Release → Run workflow**). Publish a version N, install it, publish N+1 and check that:

- the notice appears by itself on opening, and **Check for updates…** shows it too;
- with an unsaved course, the app asks before downloading, and **Cancel** stops the update;
- on Windows, with the agent panel open, the installation finishes and the app reopens;
- on Linux, the AppImage updates without asking for a password, and the `.deb` asks for the administrator one;
- after updating, **About** shows version N+1;
- without internet, the automatic check says nothing, and the manual one explains the error;
- with an altered `.sig` in the test release, the app refuses the update.

### Updates and signing

Updates work with or without the certificates. Mac versions up to 2.13.0 came out unsigned (*ad hoc*, different on each build), and macOS asked for the user's password the first time the new version read the OpenRouter key in the Keychain. With the Developer ID, the identity is the same across versions: the request appears one last time when going from the unsigned version to the first signed one, and does not come back. On Windows, the installer is still unsigned, so its first installation still shows the SmartScreen warning; the following versions, downloaded by the app itself, do not go through it. The Microsoft Store copy is signed by the Store and shows no warning.
