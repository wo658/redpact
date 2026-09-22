---
title: Desktop runtime
description: Native process ownership, local installation and signed update boundaries.
---

# Desktop runtime

Tauri 2 hosts the connected React interface in the OS WebView. Bundled Node 24 runs
the Hono HTTP/MCP server as a child process; Core remains independent of Tauri.
Native Rust owns lifecycle and updates. The main WebView can read cached update
status, check without installing, request native update confirmation, and open the fixed public GitHub
repository in the default browser through four scoped commands.
End users do not need a separate Node installation for Redpact itself.

## Build and verify

Use Node 24+, pnpm, Rust stable and platform Tauri prerequisites. macOS needs Xcode
Command Line Tools and macOS 13.5+ for the bundled Node runtime. Native Git,
Docker/Compose and authenticated `gh` remain requirements for the features using them.

```sh
pnpm desktop:dev
pnpm desktop:build
# Unattended macOS packaging without Finder decoration:
CI=true pnpm desktop:build
```

Preparation builds web/server, stages locked production dependencies and verifies
the official Node archive's SHA-256 before first use and cache reuse. Generated
provenance records version/digest. Application launch does not install dependencies
or download runtimes. Build on the target OS/architecture; another host's Node binary
cannot be silently packaged. Native Windows/Linux validation is not implied by a macOS build.

Generated resources and Cargo output live under `app/desktop/node_modules/.redpact/`.
The macOS bundle is `target/release/bundle/macos/Redpact.app` beneath that directory;
DMGs are in the sibling `dmg` directory. Native checks run from `app/desktop/src-tauri`:
`cargo test --locked` and `cargo clippy --locked -- -D warnings`.
Server lifecycle tests are `app/server/test/desktop-*.test.ts`; managed acceptance
uses `e2e/tests/desktop-runtime.test.ts`.

## Local installation

`pnpm desktop:update` builds the current checkout, including uncommitted changes,
verifies an ad-hoc code signature, stages on the destination filesystem, replaces
`/Applications/Redpact.app`, launches it and checks process/HTTP health. This local
development build is not Developer ID notarized and needs no DMG or update feed.
The command also looks for Rust in `~/.cargo/bin`.

An existing app receives normal Quit before replacement. Failed shutdown prevents
replacement. The prior bundle remains at the printed
`/Applications/.redpact-install-*/previous.app` path; replacement failure restores it.
Startup failure reports logs and preserves a backup for recovery, not automatic
runtime-data rollback. Backups are not pruned. Avoid concurrent builds. The installer
lock is `/Applications/.redpact-update.lock`; remove a stale lock only after confirming
its installer stopped. `pnpm desktop:update --help` reports supported options.

This operation does not update the development LaunchAgent or plugin configuration.
See [development updates](development.md) for those separate operations.

## Instance and lifecycle

Desktop owns its instance. On macOS the default data directory is
`~/Library/Application Support/dev.redpact.desktop/state`.
`REDPACT_DESKTOP_DATA_DIR` can select a separate absolute test directory. Never use
another running instance's directory or start a second writer against it.

First launch creates settings with port 54321; existing settings/ports are preserved.
Connect MCP to that instance's `/mcp`. The CLI/development service is independent.
Port conflict fails startup rather than attaching to an unrelated server.
`desktop-server.log` lives beside desktop instance settings.

Closing the window hides it and leaves MCP available. Dock/Show Redpact restores it;
a second application launch focuses it. Quit cancels work and awaits cleanup.
Parent-process death closes the control pipe and shuts down the owned server. A
cleanup timeout reports a retryable problem instead of forcibly killing it.

The private pipe is enabled by `REDPACT_DESKTOP_CONTROL=1`, which the server removes
before starting children. It carries readiness, shutdown and idle-update control,
not a public HTTP endpoint. The WebView permits admitted loopback/about:blank
navigation and denies external/file navigation. These desktop commands are allowed only for
the main window at the owned server origin, with an additional caller-origin check;
other loopback pages receive no desktop action authority. The GitHub command accepts
no URL argument and opens only `https://github.com/wo658/redpact`; Star opens the same
page, where the user can sign in and star the repository. It never stars automatically.

## Manual preview downloads

The [Mac preview workflow](../.github/workflows/desktop-preview.yml) is separate
from signed updater releases. Push a matching `desktop-preview-v<version>` tag.
It uses `tauri.preview.conf.json` to build ad-hoc signed apps without updater keys
on native Apple Silicon and Intel runners. Apple Silicon ships a DMG; Intel ships an app ZIP because disk-image creation
failed on the Intel runner. Each runner extracts its package, verifies the signature and bundled Node architecture, launches the native
app with isolated state, checks HTTP health, viewer HTML and MCP initialization,
and verifies owned-server shutdown after parent exit. This does not exercise
Gatekeeper approval, every WebView control, Docker tests or a previous-version upgrade.

Only after both jobs pass does the workflow create a draft prerelease with both
packages and `SHA256SUMS`. Review the evidence and publish with `--latest=false` to
preserve the stable updater feed. Do not replace published assets. These previews
have no updater feed and require manual app replacement; the signed workflow below
continues to require its persistent private key. User installation and removal are
in [installation](installation.md). The Homebrew Cask uses these same architecture-specific assets and checksums.
Apple notarization and Universal builds are not provided.

## Windows and Linux preview verification

Manually dispatch the [platform workflow](../.github/workflows/desktop-portability.yml) to build Windows
x64 NSIS installers on Windows Server 2022 and Linux x64 DEBs on Ubuntu 22.04.
It uses the same preview overlay without updater keys. Windows archive extraction
uses the OS-provided `tar.exe`, avoiding Git Bash path/archive incompatibility;
packaging uses the existing Execa dependency to launch pnpm with preserved arguments.

Both jobs retain their packages, run native Rust tests/lint, install the actual
package, launch the installed desktop with isolated settings, check bundled Node,
HTTP health/viewer and MCP, and verify owned-server shutdown and package removal.
Linux uses Xvfb and a D-Bus session. These checks do not cover Windows 10/11
interactive installer/SmartScreen behavior, every WebView control or every Linux
window system/distribution. Package download and user instructions are in
[installation](installation.md).

After successful native verification and repository checks, create a matching
`desktop-platform-preview-v<version>` tag at the reviewed source commit and upload
the exact workflow artifacts plus `SHA256SUMS` to a draft prerelease. Publish with
`--latest=false` after checking the artifacts. Keep the existing Mac release and
its checksums intact. Run [public platform installation verification](../.github/workflows/desktop-platform-installation.yml)
after publication to download the unauthenticated release URLs, verify checksums
and repeat installation/runtime/removal without rebuilding. Do not replace published files. Windows publisher signing,
AppImage/RPM, ARM builds and an updater feed are not configured for these previews.

## Signed updates

The desktop checks at startup and every six hours. The sidebar shows a text
**Update** button only when a newer version has been discovered. Settings → Updates
owns **Check for updates**; neither the sidebar nor the native menu has a permanent
manual-check action. Settings checks do not install or request installation approval.
A successful check updates the shared version indicator; an unavailable feed or failed
check reports an error instead of claiming the installation is current.

Clicking **Update** rechecks the release and opens native install/restart confirmation.
Checking or installing disables the update action. Cancellation or active-work deferral
preserves the available version. Native status is polled every five seconds; failed
status reads hide the sidebar indicator until a successful read. Background feed
failures preserve a previously discovered version. A successful no-update check hides
the button. npm installations share the button and settings placement but use their
own [runtime installation and restart path](installation.md).

Release builds retain
`https://github.com/wo658/redpact/releases/latest/download/latest.json`.
`tauri.release.conf.json` enables updater artifacts and pins the verification key.
Local builds without the release overlay report unconfigured updates. Release
preparation supplies `REDPACT_UPDATE_ENDPOINT` and `REDPACT_UPDATE_PUBLIC_KEY` at
compile time. The main WebView can read status, check without installation, request
installation confirmation and open the fixed repository through scoped native commands.

The release public key is configured and its matching private key is stored in the
repository's `TAURI_SIGNING_PRIVATE_KEY` Actions Secret. The current key has no
password, so `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is not required. Keep the existing
key for future releases; key generation below is for initial setup, not each build.
Public release downloads require no GitHub token or user-entered key. The signing
key authenticates update artifacts; the public key and endpoint are checked-in
build configuration and need no Actions Variables.

### GitHub Release workflow

The [product release workflow](../.github/workflows/desktop-release.yml) builds on
native Apple Silicon and Intel macOS runners plus Windows Server 2022. It uses
[Tauri Action](https://github.com/tauri-apps/tauri-action) to upload the Apple Silicon
DMG, Intel app ZIP, Windows NSIS installer, signed updater bundles, signatures and
`latest.json` to one **draft** GitHub Release. Uploads are serialized to preserve every
manifest platform entry. Each job runs native tests/lint and installs its package to
verify app launch, bundled Node, HTTP viewer, MCP and owned-server shutdown. After every
desktop job succeeds, the workflow publishes the GitHub Release and the same npm version
through trusted publishing. No updater sees a partial draft release.

Maintainer setup and release procedure:

1. Generate a persistent key with `pnpm --filter @redpact/desktop exec tauri signer
   generate --write-keys /secure/path/redpact.key`. Back up the private key outside
   the repository. Set the public key in `tauri.release.conf.json`; never commit
   the private key. Losing or replacing this key breaks updates for installed apps.
2. Set repository Actions Secret `TAURI_SIGNING_PRIVATE_KEY` to the private key
   contents, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has a password.
3. Update the version in `app/desktop/src-tauri/tauri.conf.json`,
   `app/desktop/src-tauri/Cargo.toml`, `app/desktop/package.json` and
   `app/server/package.json`, refresh `Cargo.lock`, and commit. Tag the verified product
   snapshot `v0.4.1` and push that single tag. Manual workflow dispatch must also select
   the matching tag. Mismatched versions,
   prerelease tags and missing signing configuration fail before packaging.
4. Wait for all jobs to succeed. Verify `latest.json` has `darwin-aarch64`,
   `darwin-x86_64` and Windows entries for this version, nonempty signatures and
   downloadable tag-specific assets. Confirm npm exposes the same version and test an
   update from the previous release. The workflow publishes the completed draft as the latest stable release.
   Never replace assets of an already published version. Keep the latest stable
   GitHub Release desktop-compatible; an unrelated latest release breaks this feed.

The first release must be installed manually; older development builds have no
feed. Publishing the first release does not prove an upgrade from a previous one.
Tauri verifies updater signatures. The workflow currently applies macOS ad-hoc
code signing, **not Apple Developer ID signing or notarization**; Gatekeeper can
block first installation. Apple signing/notarization needs separate credentials
and configuration before frictionless public distribution.
Native confirmation initiates installation and restart; background checks never install
automatically. Differential downloads and restart-free updates are not implemented.

Before installation, the parent asks for idle shutdown. New HTTP/MCP admission pauses
while admitted requests finish. Active tests/environment operations defer installation
and restore admission. Idle installation releases the server lock before replacement.
Failure after shutdown tells the user to quit/reopen; automatic binary rollback is
not implemented. Settings/evidence remain outside the app bundle and follow the
current storage-format policy. Signed end-to-end delivery needs release verification;
an unsigned local build or unconfigured-feed message does not prove it.

Implementation: [desktop source](../app/desktop/src-tauri),
[local installer](../app/desktop/tools/local-update.ts).
