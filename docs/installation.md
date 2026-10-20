---
title: Installation and agent connection
description: Start with the Redpact in-app workspace, or install and update the standalone runtime with npm or pnpm.
---

# Installation and agent connection

Redpact's public source and runtime downloads are hosted at
[wo658/redpact](https://github.com/wo658/redpact). The runtime package installs the
CLI and bundled browser viewer.

## Start in the app

Redpact's primary experience is a full development workspace beside your GPT
conversation. In compatible GPT / Codex hosts, open Redpact from **Apps in sidebar**
and continue directly to npm/pnpm installation. The App Page Plugin currently targets
macOS Apple Silicon. This does not imply public ChatGPT app-directory
availability or support in every host.

1. Install the public Plugin below.
2. Open **Redpact** from **Apps in sidebar**.
3. If the runtime is missing, click **Install Redpact**. Installation options let you choose npm or pnpm.
4. Click **Start Redpact** and connect your project. An already running runtime opens the full app directly.

Opening or reconnecting the page does not install or start the runtime. Node, npm
and pnpm are bundled with the plugin. The global commands below install a separate
browser/CLI runtime; they do not install the plugin or update its managed package.

## Choose an installation path

| Path | Includes | Requirements |
| --- | --- | --- |
| npm / pnpm | CLI and full web app | Node 24+, npm or pnpm |
| GPT / Codex App Page Plugin | Sidebar app, runtime install/start and development skills | Currently macOS Apple Silicon, npm for Plugin installation and a compatible host |
| Other agent plugins | Skills and HTTP MCP connection | A running npm/pnpm runtime |
| Skills CLI | Development and setup skills | Separately installed CLI/runtime; Node 24+, Git and pnpm |

Native Windows, Linux and macOS desktop apps, Homebrew and shell installers are no
longer distributed. Existing releases are historical artifacts, not new installation
paths. Source builds are for contributor verification. Managed tests require Docker
Compose. See [development](development.md) for web/runtime CI verification coverage.

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

Open `http://127.0.0.1:54318` for the bundled viewer and use `http://127.0.0.1:54318/mcp` for your agent. Keep the server running; Ctrl+C stops it. This installs the CLI and web viewer. Managed tests require Docker with Compose as described under Requirements.

## Install or update with npm or pnpm

With Node.js 24+, use the command for your package manager. Run the same command
to update an existing global installation to the latest public release.

```sh
npm install --global @wo658/redpact@latest
# Alternatively:
pnpm add --global @wo658/redpact@latest
redpact serve --port 54321
```

To run without a global installation:

```sh
npx @wo658/redpact@latest serve --port 54321
# Alternatively:
pnpm dlx @wo658/redpact@latest serve --port 54321
```

Finish active work and stop that runtime before updating, then start it again.
Use a user-writable global directory. If pnpm has no global executable directory,
run `pnpm setup` and reopen your terminal. The executable is named `redpact`.
Check `npm view @wo658/redpact version` for the published version; GitHub `main` may include unpublished changes.

### GitHub release tarballs

For a specific version, inspect its package and checksum in
[Releases](https://github.com/wo658/redpact/releases). The old `runtime-v0.1.0` is a
historical release, not the latest installation path. To use current source
changes, follow the source-package build instructions above.

## Install skills without a plugin

Install the development and setup skills into your project with the
[Skills CLI](https://github.com/vercel-labs/skills). Use Node 24+, Git and pnpm:

```sh
pnpm dlx skills find redpact
pnpm dlx skills add wo658/redpact --list
pnpm dlx skills add wo658/redpact --skill redpact redpact-init
```

Choose your coding agent when prompted. Add `--agent codex` or `--agent claude-code`
to select it explicitly, and `--yes` for noninteractive installation. Installation
is project-local by default; add `--global` for user-level skills. Install both
skills because their guides reference each other. They use the maintained sources
under `plugins/redpact/skills/`; there is no separate skill repository or content copy.

Skills install instructions and resources only. Install the CLI/runtime using the
npm/pnpm commands above, then start `redpact serve --port 54321` in a separate terminal.
Keep it running and open `http://127.0.0.1:54321` for review. If you already use a
running instance, keep its actual origin instead of starting another one:

```sh
redpact --help
redpact --server http://127.0.0.1:54321 workspace status --path /absolute/path/to/your-project --json
```

Replace the project path and server origin with your actual checkout and instance.
MCP is optional for the CLI workflow; Skills CLI does not register an MCP connection,
install the sidebar app or provision Docker. Managed tests still require Docker with
Compose and [project configuration](configuration.md). Execution approval stays in
the connected web viewer.

Start a new agent session. In Codex invoke `$redpact-init` to configure the project,
then `$redpact <task>` for development. Standalone Claude Code skills use
`/redpact-init` and `/redpact`; plugin commands retain their namespaced forms below.
Other agents use their own skill invocation UI. Avoid installing duplicate copies
through both Skills CLI and a plugin in the same agent scope.

`find-skills` uses `skills find` to search the ecosystem. Search indexing is separate
from GitHub installation: if Redpact is absent from results, use the direct `add`
command or `--list` above. The [skills.sh FAQ](https://skills.sh/docs/faq) describes
automatic listing through installation telemetry; it does not promise immediate
search visibility. `pnpm dlx skills check` checks installed skills for updates and
`pnpm dlx skills update` updates them; neither updates the Redpact runtime. Use
Skills CLI to manage these installations; Redpact's plugin update controls manage
plugins only.

## Install an agent plugin

The GPT / Codex public catalog installs the npm package `@wo658/redpact-plugin`.
The host uses npm to install this Plugin, so npm must already be available.

```sh
codex plugin marketplace add wo658/redpact
codex plugin add redpact@redpact
```

Restart the host and open **Apps in sidebar → Redpact**. Choose npm or pnpm in
**Install Redpact**, then click **Start Redpact**. The Plugin includes Node, npm and
pnpm for installation inside the app. This repository catalog does not establish
review or listing in the public ChatGPT Plugin directory.

For other agents, first start `redpact serve --port 54321` and keep it running.
Open `http://127.0.0.1:54321` for the viewer.

Claude Code:

```sh
claude plugin marketplace add wo658/redpact
claude plugin install redpact@redpact
```

Start a new session, then use `/redpact:redpact-init` or `/redpact:redpact`.
The Claude Code catalog installs the HTTP plugin from this repository. That plugin
does not install or launch Redpact. No Plugin installs Docker or grants test approval. These are project-hosted catalogs, not claims of
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
documents this compatibility. Installation in Copilot has not yet been verified by this project.

Cursor has its own `.cursor-plugin/marketplace.json` catalog in this repository.
Its Redpact manifest points to the same skills and MCP configuration, without copied
skill content. Use the GitHub repository when configuring a Cursor team marketplace.
Public Cursor Marketplace listing requires a separate submission and review; the
repository is not evidence of an approved listing. See the
[Cursor plugin reference](https://cursor.com/docs/reference/plugins).
Cursor installation remains unverified.

Gemini CLI uses GitHub extensions with `gemini-extension.json`, rather than these
marketplace catalogs. This repository does not currently package a Gemini extension.
Other MCP-capable clients can connect directly as described below. Redpact's in-app
plugin update controls currently support Codex and Claude Code only; other clients
manage their own plugins.

The HTTP plugins use `http://127.0.0.1:54321/mcp`; the App Page Plugin owns port 54322. To use a different instance, configure
a direct HTTP MCP connection to its actual port instead of assuming the plugin
follows it. Other clients may use that connection, but are not claimed as tested
plugin integrations. Verify CLI access with `redpact --server http://127.0.0.1:54321 settings describe --scope project --path /absolute/checkout`.
See [agent CLI](interfaces.md) for commands and instance selection.
Execution approval takes place in the connected web review screen. MCP returns its
review path without inline chat cards; unavailable approval UI must not be bypassed.
See [the interface contract](interfaces.md).

## App Page Plugin packaging and behavior

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
codex plugin add redpact@redpact
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
package `@wo658/redpact@0.9.0` with the selected bundled package manager, with lifecycle
scripts disabled. Progress is polled while the installation runs. Failures remain
visible and the button allows a retry; details are written to `install.log`.
There is no arbitrary package name, registry or command input.

Successful installs live under `~/.redpact/app-page/packages/0.9.0-npm` or
`~/.redpact/app-page/packages/0.9.0-pnpm`. The default is pnpm. A verified existing
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

**Start Redpact** appears on the startup screen after installation succeeds. While running, the shared web viewer fills the entire app area,
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

The package registers one `redpact-app` STDIO MCP connection. Its four model tools
are `get_redpact_status`, `start_redpact_runtime`, `stop_redpact_runtime` and
`open_redpact_app`; see [MCP interfaces](interfaces.md) for their contract.
There is no additional `redpact-verification` HTTP connection. The companion remains
available while the runtime is stopped. Installation and the viewer bridge retain
App-only visibility and their capability boundaries.

Agents use CLI for projects, settings, environments, tests, evidence and updates.
Install the global CLI separately to use `redpact` from a shell, then pass the status
result's `origin` through `--server` (normally `http://127.0.0.1:54322`). A custom
`REDPACT_APP_PORT` changes that origin without requiring another MCP connection.
The Plugin build pins the product version from `app/server/package.json`; publish
that runtime before distributing the Plugin. Version 0.9.0 includes the CLI.
Reconnect the host after updating the plugin to refresh its connection and tool catalog.

The default plugin port is `54322`, with runtime data in
`~/.redpact/app-page/54322` and startup output in `app-start.log` there.
`REDPACT_APP_PORT` and `REDPACT_APP_DATA_DIR` override those values. Package files
and runtime evidence are separate. Runtime update requests from the viewer report
that the App installer owns updates; the companion does not run an independent
npm self-update behind the page.

Before installation or startup, the page displays its setup screen. A healthy runtime displays the full app: projects, worktrees, files, diffs, Git, tests, environments and settings. With no record, normal project navigation or project connection is available. `open_redpact_app` also accepts paired `kind` and UUID `id` to open an exact request or execution inside the app without requesting or approving a run. The App accepts only a local canonical review path from its UI metadata. Status polls preserve that selection, including the **Open local viewer** recovery link. Inline chat approval/result cards are not provided.

The App resource bundles the existing React viewer, styles, fonts and icons directly.
Its URI includes a hash of the bundled HTML, so an updated plugin does not reuse a
previous build’s cached screen. Preview clients discover this URI from the opener tool.
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
MCP bridge. It verifies full app entry, project navigation, exact request routing, history, responsive
layout and the explicit web approval boundary. Published-package installation is a separate
check: `REDPACT_TEST_RUNTIME=installed REDPACT_TEST_MANAGER=npm pnpm test:browser`
(or `pnpm` as manager) verifies installation and owned lifecycle without claiming
current-source viewer behavior. The installer pins the runtime version recorded in the Plugin build.

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

Manage the public npm-sourced App Page Plugin through the host's Plugin controls,
or run `codex plugin marketplace upgrade redpact` followed by
`codex plugin add redpact@redpact`. The runtime update controls below support
path-based HTTP Plugins and do not compare npm-source versions.


Settings → Agent plugins checks installed Redpact plugins in Codex and Claude Code.
Set **Codex CLI path** or **Claude Code CLI path** in instance settings when automatic
executable detection fails; use an absolute executable path without arguments and
save before checking. Empty paths use PATH and common local installation directories.
The CLI runs as the Redpact server's OS user on its host, not as the browser user.
Other agents are not yet supported.

**Check plugin updates** reads each agent's installed-plugin and marketplace JSON.
It follows the installed `redpact@<marketplace>` identity, including personal and
local marketplaces; it does not switch the plugin to the official marketplace.
One enabled user installation is required. Disabled plugins, other scopes and
multiple installations need management in the owning agent. Missing CLI, incomplete
output, unknown versions and refresh failures remain explicit errors.

Redpact refreshes only that marketplace through the agent CLI when it is remote.
Codex Git marketplaces use `plugin marketplace upgrade <marketplace>`; Claude Code
remote marketplaces use `plugin marketplace update <marketplace>`. Local marketplaces
are read directly. The marketplace catalog resolves the plugin directory, whose
agent-specific manifest supplies the available version. Codex local-path entries
and Claude Code relative-directory entries are supported, including those inside
Git marketplaces. Entries pointing to a separate remote plugin repository are not
yet supported and must be managed in the agent.

The comparison does not use the app's GitHub Release version or judge app/plugin
compatibility. Only a strictly greater stable SemVer shows **Update**; build metadata
alone does not indicate a newer release. The supported Codex reinstall convention
`X.Y.Z+codex.YYYYMMDDhhmmss` is an exception: for the same base version, a later
timestamp offers an update. Newer installed versions are never downgraded. Publishers must increment the plugin manifest version when distributing
changes. Checks are manual; normal status polling reads the last in-memory result
without running CLI commands. Restarting Redpact clears that result.

**Update** opens a confirmation for the displayed agent/version. Redpact rechecks
the saved CLI path, installed version, marketplace identity and available version.
Codex installs with `plugin add redpact@<marketplace> --json`; Claude Code uses
`plugin update redpact@<marketplace> --scope user`. The marketplace name comes from
the validated installed identity. No shell command is accepted. Each CLI command
has a two-minute limit. Checks and installations are serialized within the instance.

Success requires reading back the requested installed version. Start a new agent
session afterward; disk installation does not refresh an existing conversation.
Redpact itself does not restart. Interactive CLI approval, installation failure or
a changed candidate remains an error requiring a fresh check. No automatic rollback
is provided. Do not update the same plugin concurrently in another client.

## Requirements

Install Node.js 24 or newer and pnpm for the server and web viewer. Managed test execution also needs Docker with Compose. Unit commands run in Docker using the project's configured Dockerfile; managed integration tests prepare Compose application services. Git features use native Git. Use maintained Git 2.50 or newer for managed worktree creation.

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

Next, open the Vite viewer and connect your application directory. Finally, call `redpact settings describe --scope project` from your agent. If health works but the agent cannot connect, inspect CLI `--server` or `REDPACT_SERVER_URL` and the MCP endpoint rather than changing project test settings.

## Keep instance addresses together

| Component | Source-based example | App Page Plugin |
|---|---|---|
| Redpact API | `http://127.0.0.1:54318` | `http://127.0.0.1:54322` |
| Agent MCP connection | `http://127.0.0.1:54318/mcp` | Bundled `redpact-app` STDIO companion |
| Viewer | Vite URL, proxying to the API above | Full web app in the sidebar |
| Execution history | The explicit `--data-dir` directory | The Plugin instance’s own data directory |

The public documentation preview on port `4310` is a separate reading site. It does not serve the project viewer or MCP endpoint. A working documentation page therefore does not confirm that the execution server is running.

Keep the source server's data directory when restarting if you want the same history. Stop the existing process before starting another one with that directory. Starting with a different empty directory gives you another instance's state, even if you reuse the same network port.

## Connect your agent

Add a Streamable HTTP MCP connection in your agent client using:

```text
http://127.0.0.1:54318/mcp
```

Client configuration syntax varies. Use its HTTP MCP connection facility; Redpact does not supply a stdio bridge for this workflow. See [MCP interfaces](interfaces.md) for model lifecycle tools, App-only transport and CLI settings, execution and evidence commands.

Ask the agent to inspect settings through CLI, replacing the path and selecting the connected instance:

```sh
redpact --server http://127.0.0.1:54321 settings describe \
  --scope project --path /absolute/path/to/your-project --json
```

Receiving the settings schema and authoring guidance confirms connectivity. It does not confirm Docker readiness or execute tests.

Connect the agent and viewer to the same instance. Results from one server do not appear in another server's history. HTTP Plugins target port `54321`, and the App Page Plugin uses `54322`; it does not automatically follow a development server on `54318`.

## Runtime updates

npm-installed browser viewers show **Update** in the sidebar when a newer version
is available. Manual **Check for updates** lives in Settings → Updates.

The npm runtime queries the public `@wo658/redpact` registry dist-tags at startup and every
six hours; browser polling reads the server cache. Stable installations follow
`latest`; prerelease installations consider `beta` and `latest` and never downgrade.
Checks have a ten-second deadline. Registry absence, invalid metadata and network
failure are errors, not proof that the installed version is current. Source checkouts do not start npm checks.

For recognized global npm/pnpm installations and direct local npm/pnpm dependencies,
`redpact serve` keeps a CLI parent process outside the replaceable server. Clicking
**Update** opens confirmation; **Install and restart** requests the displayed version.
New requests pause while admitted requests finish. Active tests, environment operations
and other tracked work defer installation and restore service. Only after the owned
server stops does the parent run the original package manager against the explicit
version with lifecycle scripts disabled. Local updates modify the owning project's
package manifest and lockfile, preserving development-dependency classification.
The parent verifies the installed package version and restarts with the same options
and listening port; the browser reloads after observing that version.

An installation under a custom global prefix can still start when that prefix is
not the package manager's active global root; a missing project manifest there does
not block startup. Automatic updates require the original owner to be recognized.

`npx` caches, unrecognized installation owners, source launches and direct `main.js`
launches do not receive automatic installation authority. The dialog explains manual
recovery instead of guessing a global install. For `npx`, stop the old process and
run `npx @wo658/redpact@latest serve` with the original options; prerelease users choose their
intended explicit version/channel. Other installations use their original manager.

Installation failures are surfaced when the server can restart. If package replacement
or startup leaves it unavailable, reopen/reinstall using the original manager.
Automatic binary or data rollback is not provided. The parent owns only its child:
close other instances using the same package before updating it. Stored settings and
evidence remain outside the package and follow the current storage-format policy.
Publishing npm versions and Plugin packages remains a separate release operation;
this feature neither publishes packages nor configures npm credentials.
