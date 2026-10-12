---
title: Installation and agent connection
description: Install Redpact from GitHub with Homebrew or the terminal and connect Codex or Claude Code.
---

# Installation and agent connection

Redpact's public source and runtime downloads are hosted at
[wo658/redpact](https://github.com/wo658/redpact). The runtime package installs the
CLI and bundled browser viewer. It does not install the Tauri desktop application.

## Host the web viewer with Docker Compose

From this source checkout, run:

```sh
docker compose up -d --build --wait
```

Open `http://127.0.0.1:54318`. The same container serves the built viewer, `/api`
and `/mcp`; no Vite process or desktop app is needed. If that port is occupied,
run `REDPACT_WEB_PORT=54328 docker compose up -d --build --wait` and open port
54328 instead. Ports are published only on the host's loopback interface. The
current local Host/Origin boundary does not support public-domain or LAN hosting;
do not simply expose this unauthenticated development service publicly.

Check the running service and installed version:

```sh
docker compose ps
curl --fail http://127.0.0.1:54318/api/health
curl --fail http://127.0.0.1:54318/api/updates
docker compose exec redpact node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version"
```

`/api/updates` includes `currentVersion`. Change the curl port when using an
override. Rebuild with the startup command after updating the checkout; container
updates are managed through image replacement, not the viewer's package installer.
`docker compose down` stops hosting while retaining the `redpact-data` volume;
`docker compose down -v` also deletes that instance's settings and evidence.

The default container starts with no connected projects and does not mount host
repositories or the Docker socket. To execute against a real project, explicitly bind-mount
its checkout in a Compose override and use its **container path** in configuration
and MCP requests.
Keep any referenced worktrees and Git common directories accessible at their stored
paths, and ensure the container's `node` user has the necessary permissions.
This baseline hosts the viewer/API; it does not establish managed test execution
or host Git operation readiness. Managed tests need
additional Docker access and consistent host/container bind paths. For a full local
development runner, use the host-installed runtime described below.

## Choose an installation path

| Path | What it installs | Requirements / limits |
| --- | --- | --- |
| macOS desktop download | Native app, server, viewer and Node | macOS 13.5+, Apple Silicon or Intel; signed updates, without notarization |
| Windows desktop download | Native app, server, viewer and Node | Windows x64 EXE; signed updates, without publisher code signing |
| Linux desktop preview | Native app, server, viewer and Node | Ubuntu 22.04 x64 DEB; manual updates |
| Homebrew custom tap | CLI formula or macOS desktop Cask | Select `--cask` for the desktop; desktop preview is not notarized |
| Terminal installer | CLI and browser viewer under `~/.local` | macOS or Linux, Node 24+, npm, curl and SHA-256 utility |
| GitHub release tarball with npm/pnpm | CLI and browser viewer | Node 24+ and npm or pnpm |
| GitHub source checkout | Contributor build | Node 24+, pnpm; Rust for desktop |
| Codex plugin | MCP connection and skills | Codex plus a running Redpact instance on port 54321 |
| Claude Code plugin | MCP connection and skills | Claude Code plus the same running instance |

Managed execution additionally needs Docker with Compose. Git operations use native
Git for source identity. Installation and MCP
connectivity do not verify Docker readiness or client support for MCP Apps.
The [npm installation matrix](development.md) covers Windows x64 with Node 24 and 26.
ARM Windows/Linux, other Linux distributions and a Universal macOS installer remain
unverified. The macOS app is not Apple notarized; the Windows app has no publisher
code-signing certificate. Updater signatures are separate from OS code signing.

## Install a bundled runtime from source

With Node.js 24+, pnpm, and Git installed, build a package containing both the server and viewer:

```sh
git clone https://github.com/wo658/redpact.git
cd redpact
pnpm install --frozen-lockfile
pnpm pack:runtime
redpact_version=$(node -p "require('./app/server/package.json').version")
pnpm add --global "./dist/redpact-${redpact_version}.tgz"
redpact serve --project /absolute/path/to/your-project
```

Replace the project path with your checkout. The command reads the package version from this checkout; `pnpm pack:runtime` also prints the generated tarball path. If pnpm reports that its global bin directory is missing, run `pnpm setup`, reopen your terminal, and retry the global installation from the Redpact checkout.

Open `http://127.0.0.1:54318` for the bundled viewer and use `http://127.0.0.1:54318/mcp` for your agent. Keep the server running; Ctrl+C stops it. This installs the CLI and web viewer. For the native desktop app, follow the macOS build instructions below. Managed tests require Docker with Compose as described under Requirements.

## macOS desktop download

Download the matching package from the [current desktop release](https://github.com/wo658/redpact/releases/latest). Use the version shown on that release in these filenames:

- Apple Silicon (M-series): `Redpact_<version>_aarch64.dmg`.
- Intel: `Redpact_<version>_x64.zip`.

Open the Apple Silicon DMG (or extract the Intel ZIP), drag **Redpact** to **Applications**, eject the disk image if used, then open
Redpact. Node, the server and viewer are bundled; no terminal server command is needed.
The first-launch MCP address is `http://127.0.0.1:54321/mcp`. Quit any other Redpact
instance using that port before opening the desktop app.

These builds are ad-hoc signed, **not Apple notarized**. Compare
`shasum -a 256 <downloaded-file>` with the SHA-256 digest for that asset on GitHub.
The current product release workflow does not attach a separate `SHA256SUMS` file;
older preview releases provide one.
If macOS blocks it, follow [Apple's app-specific Open Anyway instructions](https://support.apple.com/en-us/102445)
in System Settings → Privacy & Security after checking the source. Do not disable
Gatekeeper globally. A matching checksum confirms the release file, not Apple review.

Current product releases check for signed updates at startup and every six hours; installation
and restart require confirmation. Install this release manually once when upgrading
from a preview or development build without a feed. Finish active work, quit Redpact
and replace the app in Applications. To uninstall,
quit and remove `Redpact.app`; settings and results remain in
`~/Library/Application Support/dev.redpact.desktop/state`.
See [desktop lifecycle and release boundaries](desktop.md).

### Homebrew desktop Cask

```sh
brew tap wo658/redpact https://github.com/wo658/redpact.git
brew install --cask wo658/redpact/redpact
open /Applications/Redpact.app
```

The Cask currently installs the older 0.1.0 preview without an update feed. Use the
direct download above for the current product release and signed updates. The Cask selects the matching
Apple Silicon DMG or Intel ZIP and verifies its checksum.
It has the same notarization and first-launch limitations as the direct download.
Use `brew update` then `brew upgrade --cask wo658/redpact/redpact` after quitting
Redpact to install a newer Cask version. Remove with
`brew uninstall --cask wo658/redpact/redpact`; instance data is retained.
If you previously installed the DMG manually, quit and move that app out of
Applications before installing the Cask. Keep the old copy until launch succeeds.

## Windows and Linux desktop downloads

Windows uses the [current desktop release](https://github.com/wo658/redpact/releases/latest).
Linux uses the [platform preview](https://github.com/wo658/redpact/releases/tag/desktop-platform-preview-v0.1.0).
Node, the server and viewer are bundled. Quit other Redpact instances using port
54321 before opening the app; its initial MCP endpoint is `http://127.0.0.1:54321/mcp`.

### Windows x64

Download `Redpact_<version>_x64-setup.exe` for the current release, run it and open
Redpact from the Start menu.
The installer provisions WebView2 when needed, so first installation may need
network access. The installer has no publisher code signature; Windows SmartScreen
may show a publisher warning. Verify the release source and compare
`Get-FileHash <file> -Algorithm SHA256` with the asset's SHA-256 digest on GitHub.
Native build, silent installation, app/server/viewer/MCP launch
and uninstall are tested on the GitHub Windows Server 2022 runner. Windows 10/11
interactive installation and SmartScreen approval are not covered by that check.

Current Windows product releases support the same signed update checks and explicit
install/restart confirmation as macOS. For manual replacement, quit Redpact before
running a newer installer. Remove it through Windows Settings
→ Apps. Instance settings/results are separate from the installation and remain
under `%APPDATA%\dev.redpact.desktop\state`.

### Ubuntu x64

Download `Redpact_0.1.0_amd64.deb`, compare `sha256sum <file>` with `SHA256SUMS`, then:

```sh
sudo apt install ./Redpact_0.1.0_amd64.deb
redpact-desktop
```

The package manager installs the required system libraries, including WebKitGTK.
Native build, DEB installation, desktop/server/viewer/MCP launch under a virtual
X display and package removal are tested on Ubuntu 22.04 x64. This does not establish
compatibility with every Linux distribution, Wayland session or desktop environment.
AppImage, RPM and ARM packages are not provided.

For an update, quit Redpact and install the newer DEB with `apt install ./<file>`.
Remove with `sudo apt remove redpact`; instance data stays in
`${XDG_DATA_HOME:-$HOME/.local/share}/dev.redpact.desktop/state`.
The Linux preview uses manual updates and retains the [desktop lifecycle](desktop.md).
Installation checks do not prove managed Docker execution or every WebView interaction.

## Homebrew

```sh
brew tap wo658/redpact https://github.com/wo658/redpact.git
brew install wo658/redpact/redpact
redpact serve --port 54321
```

Update with `brew update && brew upgrade wo658/redpact/redpact`. Remove the package
with `brew uninstall wo658/redpact/redpact`; runtime state is separate and retained.
This is the project's custom tap, not Homebrew core. Use the explicit repository URL
when adding it because the source repository is named `redpact`, not `homebrew-redpact`.

## Terminal installer

```sh
curl -fsSL https://raw.githubusercontent.com/wo658/redpact/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
redpact serve --port 54321
```

The script downloads the pinned runtime release and checks `SHA256SUMS` before npm
installation. It requires Node 24+ and npm already installed and does not use sudo.
Save the PATH setting in your shell profile for future terminals. To inspect before
running, download `install.sh`, read it, then run `sh install.sh`. An absolute custom
prefix is supported with `sh install.sh --prefix /absolute/path`.
Rerun the installer to install the release it currently selects. It refuses to replace
an unrelated executable. Remove `<prefix>/bin/redpact` and `<prefix>/share/redpact`
to uninstall this route; do not remove your runtime data directory unless intended.

## GitHub release package

Download and inspect the checksum from
[the runtime release](https://github.com/wo658/redpact/releases/tag/runtime-v0.1.0),
or install its package URL directly with either package manager:

```sh
npm install --global --ignore-scripts https://github.com/wo658/redpact/releases/download/runtime-v0.1.0/redpact-0.1.0.tgz
# Alternatively:
pnpm add --global --ignore-scripts https://github.com/wo658/redpact/releases/download/runtime-v0.1.0/redpact-0.1.0.tgz
redpact serve --port 54321
```

Use a user-writable global package directory. The terminal installer above avoids
global directory setup and validates the release checksum automatically.
The public registry package is `@wo658/redpact`. Install or run it by package name:

```sh
npm install --global @wo658/redpact
# Alternatively:
pnpm add --global @wo658/redpact
npx @wo658/redpact@latest serve
```

The installed executable remains `redpact`. GitHub tarball installation does not require
npm publishing credentials. Dependencies still come from npm.

## Install an agent plugin

First start `redpact serve --port 54321` and keep that terminal running. Open
`http://127.0.0.1:54321` for the viewer. If the desktop already owns that port,
connect to it instead of starting a second instance.

Codex:

```sh
codex plugin marketplace add wo658/redpact
codex plugin add redpact@redpact
```

Start a new task, then use `$redpact-init` for project setup or `$redpact` for work.

Claude Code:

```sh
claude plugin marketplace add wo658/redpact
claude plugin install redpact@redpact
```

Start a new session, then use `/redpact:redpact-init` or `/redpact:redpact`.
Both catalogs install the same self-contained skill and MCP files from the public
GitHub repository. Plugin installation does not install or launch Redpact, install
Docker, or grant test approval. These are project-hosted catalogs, not claims of
listing in an OpenAI or Anthropic curated directory.

### Other agent marketplaces

The public repository is the marketplace source: `https://github.com/wo658/redpact`.
Each client reads its own catalog; there is no universal marketplace registration
command. Registering a marketplace and installing its Redpact plugin are separate
operations. Existing `redpact@personal` installations are not automatically migrated.
Use the owning client to disable or remove a duplicate before using the hosted copy.

GitHub Copilot CLI supports the existing Claude-format catalog and manifest:

```sh
copilot plugin marketplace add wo658/redpact
copilot plugin install redpact@redpact
```

This requires the GitHub Copilot CLI with `plugin` commands, not another executable
named `copilot`. The [Copilot plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
documents this compatibility. Installation and MCP Apps rendering in Copilot have
not yet been verified by this project.

Cursor has its own `.cursor-plugin/marketplace.json` catalog in this repository.
Its Redpact manifest points to the same skills and MCP configuration, without copied
skill content. Use the GitHub repository when configuring a Cursor team marketplace.
Public Cursor Marketplace listing requires a separate submission and review; the
repository is not evidence of an approved listing. See the
[Cursor plugin reference](https://cursor.com/docs/reference/plugins).
Cursor installation and MCP Apps rendering remain unverified.

Gemini CLI uses GitHub extensions with `gemini-extension.json`, rather than these
marketplace catalogs. This repository does not currently package a Gemini extension.
Other MCP-capable clients can connect directly as described below. Redpact's in-app
each host manages its own plugin updates.

The plugin uses `http://127.0.0.1:54321/mcp`. To use a different instance, configure
a direct HTTP MCP connection to its actual port instead of assuming the plugin
follows it. Other clients may use that connection, but are not claimed as tested
plugin integrations. Ask the agent to call `configure describe` to verify tools.
Execution approval cards require a compatible MCP Apps host. Plugin installation
alone does not prove card support; an unavailable approval UI must not be bypassed.
See [the interface contract](interfaces.md).

## Local Redpact App Page experiment

[Redpact App](../examples/sidebar-app/README.md) is an independent local STDIO MCP
App Page. Its macOS arm64 bootstrap bundles official Node 26.0.0, npm and pnpm 11.2.2,
with their licenses, but does **not** include the Redpact server. The page works
before Redpact is installed. Users do not need a separate Node, npm, pnpm or Redpact
installation to use this artifact. Installing the runtime requires network access
to the public npm registry. Docker and project-specific execution tools remain
separate prerequisites for features that need them.

Contributors building the bootstrap require Node, pnpm, and installed workspace dependencies
(`pnpm install --frozen-lockfile` at the repository root). The plugin bundles the same
`app/web` viewer using relative asset paths. From the repository root:

```sh
cd examples/sidebar-app
pnpm install --frozen-lockfile
pnpm bundle:redpact
codex plugin marketplace add "$PWD/dist/redpact-marketplace"
codex plugin add redpact-app@redpact-app-local
```

`bundle:redpact` checks the official Node archive against its release SHA-256 list,
includes its npm distribution, and installs the pinned pnpm CLI into the plugin.
`pnpm build` then rebuilds the companion and page without downloading tooling.
The artifact uses portable `plugin.json` and `mcp.json`: contained commands and
`${PLUGIN_ROOT}` resolve from the installed plugin copy, not the source checkout.
Windows, Linux and macOS Intel artifacts are not yet packaged.

After saving work and restarting Codex, look for **Redpact** in Global Apps.
`open_redpact_app` declares `global` and `thread` entrypoints. Actual Global Apps
visibility must be checked in the host; a browser harness cannot
establish it.

When the plugin-managed runtime is missing, the page shows **Install Redpact** and
an **npm / pnpm** selector. Installation is an explicit action; opening the page or
refreshing it does not install anything. The companion installs the fixed public
package `@wo658/redpact@0.8.0` with the selected bundled package manager, with lifecycle
scripts disabled. Progress is polled while the installation runs. Failures remain
visible and the button allows a retry; details are written to `install.log`.
There is no arbitrary package name, registry or command input.

Successful installs live under `~/.redpact/app-page/packages/0.8.0-npm` or
`~/.redpact/app-page/packages/0.8.0-pnpm`. The default is pnpm. A verified existing
installation is reused; if both are present, npm is selected first. This lookup
covers plugin-managed packages, not unrelated global installations or desktop apps.
Each attempt uses a temporary directory and publishes its installation directory
only after the package version, entrypoint and viewer have been checked. It does
not change global PATH, globally installed packages, or project dependencies.
`REDPACT_APP_INSTALL_DIR` overrides the package root for the MCP process.

Opening the plugin or reconnecting its MCP session only checks runtime status; it
never installs or starts Redpact automatically. A missing managed package displays
**Install Redpact**. An installed but stopped runtime displays **Start Redpact**,
including after a host restart. A healthy existing server is reused; an unrecognized
listener blocks startup. Status polling preserves an explicitly stopped runtime.

**Start Redpact** appears on the startup screen after installation succeeds. While running, the existing Desktop/Web viewer fills the entire app area,
without a plugin header or additional navigation. **Refresh**, **Open local viewer**
and lifecycle recovery controls appear only when a connection or viewer error occurs.
The private app-only MCP stop tool remains available to the host.
Starting does not execute tests or create
containers. Stop uses the existing private parent IPC channel and can interrupt
active work in its owned runtime, while preserving stored evidence. An external
server on the port can be read but cannot be stopped by another plugin session.
An unrecognized listener blocks startup. Lifecycle changes are serialized.

The App package includes the same `redpact` and `redpact-init` skills as the regular
plugin, with their MCP dependency bound to this App instance. The build copies the
maintained skill sources into the portable `skills/` directory and adjusts only
connection metadata; there is no second maintained skill set.

The plugin also registers a separate `redpact-verification` HTTP MCP connection to
`http://127.0.0.1:54322/mcp`, the same runtime and evidence store used by the sidebar.
It exposes the runtime's model tools directly, preserving its approval cards and
capability boundary; the App-only viewer bridge remains private. See
[MCP interfaces](interfaces.md) for the verification contracts. The bundled installer
still downloads public 0.8.0, whose tool set is older; expanded verification tools
require a runtime built from this source or a future release containing it.
After starting or updating a runtime, reconnect the host's MCP connection if its tool
catalog is stale or was unavailable during startup. A custom `REDPACT_APP_PORT` also
requires updating this HTTP MCP URL in the plugin manifest.

The default plugin port is `54322`, with runtime data in
`~/.redpact/app-page/54322` and startup output in `app-start.log` there.
`REDPACT_APP_PORT` and `REDPACT_APP_DATA_DIR` override those values. Package files
and runtime evidence are separate. Runtime update requests from the viewer report
that the App installer owns updates; the companion does not run an independent
npm self-update behind the page.

Before installation or startup, the page displays its setup screen. A healthy
runtime displays the exact-record viewer and worktree-bound history. With no record,
it asks the user to open an execution from chat. `open_redpact_app` accepts paired
`kind` and UUID `id` to open that record directly; it does not request or approve a run.
The App accepts only a local canonical review path from its UI metadata. Status
polls preserve that selection, including the **Open local viewer** recovery link.
Project management, settings editors, manual Container and Git controls are absent.

The App resource bundles the existing React viewer, styles, fonts and icons directly.
It requires no nested iframe, browser HTTP connection or loopback CSP exception.
Codex can block HTTP frames even when the resource declares a loopback origin;
the App therefore uses the supported MCP Apps tool bridge instead.

API calls travel through an App-only capability-authenticated tool to the fixed
local runtime. Arbitrary origins, non-API paths and redirects are rejected; browser
cookies and authorization headers are not forwarded. Requests support the viewer's
GET/POST/PUT/PATCH/DELETE operations. JSON request bodies are limited to 1 MiB of
text and responses to 16 MiB; larger artifacts must be opened in the standalone
viewer. Capture images use data URLs so they also render in hosts that disallow
`blob:` image sources. Other binary attachments use local blob URLs, revoked when
the view unmounts. Failed image requests and decoding errors display the artifact
name and a diagnostic instead of a broken image icon.
The runtime's own Host, Origin and Fetch Metadata checks remain unchanged.

The companion keeps real scoped SSE subscriptions and the App polls their revision
and error state once per second. Unmounted scopes close their subscriptions; abandoned
subscriptions expire after 30 seconds and MCP disconnect closes all subscriptions.
The shell checks runtime health every five seconds (installation progress every second).
A stopped or unhealthy runtime returns to the startup screen without automatically
installing, restarting or executing tests. Connection failures expose **Refresh**
and **Open local viewer**, which opens the installed package's standalone viewer.
Neither server health nor a passing test means a change has been accepted.

Closing the page does not itself close the MCP session. Disconnecting the owning
MCP session stops its child runtime; pending package installation is cancelled.
A later session reuses the installed package and stored data. Remove the companion
with `codex plugin remove redpact-app@redpact-app-local`; active sessions must first
disconnect to stop their owned processes. Plugin removal preserves the managed
package directory and runtime data. Uninstalling a separate global Redpact package
or moving its desktop application to Trash also leaves runtime data untouched.

For verification, install Playwright Chromium (`pnpm exec playwright install chromium`)
and run `pnpm typecheck` and `pnpm test`. After building the current server/viewer and
this companion, `pnpm test:browser` checks the source-built runtime through the real
MCP bridge. It verifies the empty state, exact request routing, history, responsive
layout and preserved approval boundary. Published-package installation is a separate
check: `REDPACT_TEST_RUNTIME=installed REDPACT_TEST_MANAGER=npm pnpm test:browser`
(or `pnpm` as manager) verifies installation and owned lifecycle without claiming
current-source viewer behavior. The installer still pins public 0.8.0.

Artifacts and logs go under `dist/redpact-evidence/`. `pnpm preview` starts the local
harness at `http://127.0.0.1:4320`. Neither harness proves native Codex Global Apps
discovery, host rendering or human acceptance of code. Managed project acceptance
remains separate from these companion checks.

The setup screen shows one primary action for its current state: **Install Redpact**
before installation, **Installing…** during installation, and **Start Redpact** when
installed and stopped. Installation failures show **Try again** with the diagnostic.
**Installation options** contains the package-manager selector and installation paths;
**Connection details** contains the address, runtime data directory and startup log.
Unavailable start/stop actions are hidden. Refresh and recovery controls appear for
connection failures. The setup shell follows the host's light/dark theme and reflows
for narrow App panels.

The installation and stopped screens share a centered logo, short state heading and primary action in both themes. They omit promotional descriptions, repeated branding and footer copy; connection and installation diagnostics remain available when needed.

## Agent plugin updates

Manage installation and updates with the host's plugin tools. Redpact does not inspect
host installation catalogs or expose an API that changes plugins through host CLIs.
Plugin connections/skills and the Redpact runtime are separate: updating a plugin
does not replace the runtime or its data. Refresh the host's MCP catalog after changing
its connection.

## Requirements

Install Node.js 24 or newer and pnpm for the server and web viewer. Managed test execution also needs Docker with Compose. Unit commands run in Docker using the project's configured Dockerfile; managed integration tests prepare Compose application services. Git features use native Git. The host owns worktree creation and Git mutations.

Run these commands from the Redpact source checkout:

```sh
pnpm install --frozen-lockfile
pnpm --filter @redpact/server build
```

Dependency installation enables this repository's Git hooks. It does not install a desktop application or publish a runtime package.

## Start the server and viewer

Start a server with a dedicated absolute directory for its settings and results:

```sh
node app/server/dist/cli.js serve --data-dir /absolute/path/to/redpact-state --port 54318
```

Replace the example directory with a location you intend to keep. One process can own a data directory at a time. Add `--project /absolute/path/to/your-project` to connect an initial project at startup.

In a second terminal, from the same Redpact checkout:

```sh
REDPACT_API_URL=http://127.0.0.1:54318 pnpm --filter @redpact/web dev
```

Open the loopback URL printed by Vite. The viewer proxies API requests to the server. Keep both processes running. Check server health at `http://127.0.0.1:54318/api/health`.

The CLI default port is `54318`. On startup, the log's `url` field gives the viewer address, such as `http://127.0.0.1:54318/`; open that address directly. `--port` overrides instance settings for that launch; a busy port fails startup. Redpact binds to loopback and requires no API token. It is a local application, not a service intended for public exposure.

## Verify each connection separately

The server, viewer and agent have separate connections. Check them in this order so a viewer problem is not confused with a test-execution problem:

```sh
node --version
pnpm --version
docker version
docker compose version
curl --fail http://127.0.0.1:54318/api/health
```

`docker version` should report the server as well as the client. If it cannot reach the Docker daemon, start Docker before attempting managed execution. The health request should succeed once Redpact is listening. Neither check proves that your application's image builds or its services become healthy.

Next, call `configure describe` from your agent with the actual application directory. The viewer opens a returned execution record from chat. If health works but the agent cannot connect, inspect the MCP endpoint and client connection rather than changing project test settings.

## Keep instance addresses together

| Component | Source-based example | Desktop default |
|---|---|---|
| Redpact API | `http://127.0.0.1:54318` | `http://127.0.0.1:54321` |
| Agent MCP endpoint | `http://127.0.0.1:54318/mcp` | `http://127.0.0.1:54321/mcp` |
| Viewer | Vite URL, proxying to the API above | Bundled desktop window |
| Execution history | The explicit `--data-dir` directory | The desktop instance's own data directory |

The public documentation preview on port `4310` is a separate reading site. It does not serve the project viewer or MCP endpoint. A working documentation page therefore does not confirm that the execution server is running.

Keep the source server's data directory when restarting if you want the same history. Stop the existing process before starting another one with that directory. Starting with a different empty directory gives you another instance's state, even if you reuse the same network port.

## Connect your agent

Add a Streamable HTTP MCP connection in your agent client using:

```text
http://127.0.0.1:54318/mcp
```

Client configuration syntax varies. Use its HTTP MCP connection facility; Redpact does not supply a stdio bridge for this workflow. See [MCP interfaces](interfaces.md) for the model-facing configuration, execution and evidence tools.

Ask the agent to call `configure`, replacing the path:

```json
{
  "action": "describe",
  "path": "/absolute/path/to/your-project"
}
```

Receiving the settings schema and authoring guidance confirms connectivity. It does not confirm Docker readiness or execute tests.

Connect the agent and viewer to the same instance. Results from one server do not appear in another server's history. The bundled local plugin targets the desktop default port `54321`; it does not automatically follow a development server on `54318`.

## Optional macOS desktop build

The desktop bundles the viewer, server, and Node runtime. Building it requires Rust stable and the platform's Tauri prerequisites in addition to Node and pnpm. macOS needs Xcode Command Line Tools; the bundled Node runtime requires macOS 13.5 or later. Windows and Linux build and installation verification is described above.

From the Redpact checkout, run `pnpm desktop:dev` for development. For a personal macOS installation:

```sh
pnpm desktop:update
```

This builds the current checkout, installs `/Applications/Redpact.app`, launches it, and checks health. It can replace an existing installation, so finish active work first. This is an ad-hoc signed development build, not a notarized public release. It does not update the agent plugin configuration.

The desktop owns a separate instance. Its first-launch MCP endpoint is `http://127.0.0.1:54321/mcp`; use the saved instance port if changed. Closing the window keeps the server available; quitting Redpact shuts it down. Development-server history does not automatically appear in the desktop.

Continue with [your first project](configuration.md), or see [troubleshooting](troubleshooting.md).

## Runtime updates

The focused review viewer has no Update shortcut or Updates settings panel. Manage
the installed package through its original installation method. The existing npm
update HTTP workflow and [signed native updater](desktop.md) remain backend
capabilities; reading status never installs a release.

The npm runtime queries the public `@wo658/redpact` registry dist-tags at startup and every
six hours; HTTP status reads return the server cache. Stable installations follow
`latest`; prerelease installations consider `beta` and `latest` and never downgrade.
Checks have a ten-second deadline. Registry absence, invalid metadata and network
failure are errors, not proof that the installed version is current. Source checkouts
and desktop-owned servers do not start npm checks.

For recognized global npm/pnpm installations and direct local npm/pnpm dependencies,
`redpact serve` keeps a CLI parent process outside the replaceable server. An explicit
HTTP install request must name the discovered version.
New requests pause while admitted requests finish. Active tests, environment operations
and other tracked work defer installation and restore service. Only after the owned
server stops does the parent run the original package manager against the explicit
version with lifecycle scripts disabled. Local updates modify the owning project's
package manifest and lockfile, preserving development-dependency classification.
The parent verifies the installed package version and restarts with the same options
and listening port; clients reconnect after the runtime restarts.

An installation under a custom global prefix can still start when that prefix is
not the package manager's active global root; a missing project manifest there does
not block startup. Automatic updates require the original owner to be recognized.

`npx` caches, unrecognized installation owners, source launches and direct `main.js`
launches do not receive automatic installation authority. Unsupported installation requests report manual
recovery instead of guessing a global install. For `npx`, stop the old process and
run `npx @wo658/redpact@latest serve` with the original options; prerelease users choose their
intended explicit version/channel. Other installations use their original manager.

Installation failures are surfaced when the server can restart. If package replacement
or startup leaves it unavailable, reopen/reinstall using the original manager.
Automatic binary or data rollback is not provided. The parent owns only its child:
close other instances using the same package before updating it. Stored settings and
evidence remain outside the package and follow the current storage-format policy.
Publishing npm versions and native releases remains a separate release operation;
this feature neither publishes packages nor configures npm credentials.
