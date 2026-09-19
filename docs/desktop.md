---
title: Desktop runtime
description: Native process ownership, local installation and signed update boundaries.
---

# Desktop runtime

Tauri 2 hosts the connected React interface in the OS WebView. Bundled Node 24 runs
the Hono HTTP/MCP server as a child process; Core remains independent of Tauri.
The WebView has no privileged Tauri command capabilities. Native menus own lifecycle
and updates. End users do not need a separate Node installation for Redpact itself.

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
navigation and denies external/file navigation; loopback pages gain no native bridge.

## Signed updates

Check for Updates lives in the native menu. A development build without a feed says
so. An updatable release needs a real HTTPS endpoint, a Tauri signing key pair and
platform/architecture artifacts. Configure `REDPACT_UPDATE_ENDPOINT`,
`REDPACT_UPDATE_PUBLIC_KEY`, and private `TAURI_SIGNING_PRIVATE_KEY`, then enable
`bundle.createUpdaterArtifacts` in the Tauri build. Never commit private keys.
Publish immutable signed artifacts before their updater manifest.

Tauri verifies update signatures; macOS Developer ID signing/notarization is a
separate distribution requirement. No production feed or signing credentials are
provided automatically. Native menu confirmation initiates install and restart;
background scheduled checks, differential downloads and restart-free updates are
not promised.

Before installation, the parent asks for idle shutdown. New HTTP/MCP admission pauses
while admitted requests finish. Active tests/environment operations defer installation
and restore admission. Idle installation releases the server lock before replacement.
Failure after shutdown tells the user to quit/reopen; automatic binary rollback is
not implemented. Settings/evidence remain outside the app bundle and follow the
current storage-format policy. Signed end-to-end delivery needs release verification;
an unsigned local build or unconfigured-feed message does not prove it.

Implementation: [desktop source](../app/desktop/src-tauri),
[local installer](../app/desktop/tools/local-update.ts).
