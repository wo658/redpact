---
title: Installation and agent connection
description: Install Redpact from GitHub with Homebrew or the terminal and connect Codex or Claude Code.
---

# Installation and agent connection

Redpact's public source and runtime downloads are hosted at
[wo658/redpact](https://github.com/wo658/redpact). The runtime package installs the
CLI and bundled browser viewer. It does not install the Tauri desktop application.

## Choose an installation path

| Path | What it installs | Requirements / limits |
| --- | --- | --- |
| Homebrew custom tap | CLI and browser viewer, with Node | macOS or Linux with Homebrew; not a desktop Cask |
| Terminal installer | CLI and browser viewer under `~/.local` | macOS or Linux, Node 24+, npm, curl and SHA-256 utility |
| GitHub release tarball with npm/pnpm | CLI and browser viewer | Node 24+ and npm or pnpm |
| GitHub source checkout | Contributor build | Node 24+, pnpm; Rust for desktop |
| Codex plugin | MCP connection and skills | Codex plus a running Redpact instance on port 54321 |
| Claude Code plugin | MCP connection and skills | Claude Code plus the same running instance |

Managed execution additionally needs Docker with Compose. Git operations use native
Git; managed worktree creation requires maintained Git 2.50+. Installation and MCP
connectivity do not verify Docker readiness or client support for MCP Apps.
Windows package installation, native Windows/Linux desktop builds and a Universal
macOS desktop installer are not verified distribution paths. No Homebrew desktop
Cask or notarized desktop release is supplied by these runtime instructions.

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
`npm install -g redpact`, `pnpm add -g redpact`, and `npx redpact` by package name
are not available until an npm registry release is published. GitHub tarball installation
does not require npm publishing credentials. Dependencies still come from npm.

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

The plugin uses `http://127.0.0.1:54321/mcp`. To use a different instance, configure
a direct HTTP MCP connection to its actual port instead of assuming the plugin
follows it. Other clients may use that connection, but are not claimed as tested
plugin integrations. Ask the agent to call `configure describe` to verify tools.
Approval and credential cards require a compatible MCP Apps host. Plugin installation
alone does not prove card support; an unavailable approval UI must not be bypassed.
See [the interface contract](interfaces.md).

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

The CLI default port is `54318`. `--port` overrides instance settings for that launch; a busy port fails startup. Redpact binds to loopback and requires no API token. It is a local application, not a service intended for public exposure.

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

Next, open the Vite viewer and connect your application directory. Finally, call `configure describe` from your agent. If health works but the agent cannot connect, inspect the MCP endpoint and client connection rather than changing project test settings.

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

Client configuration syntax varies. Use its HTTP MCP connection facility; Redpact does not supply a stdio bridge for this workflow. The model-facing tools are `configure`, `run_tests`, `get_run`, and `request_keys`.

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

The desktop bundles the viewer, server, and Node runtime. Building it requires Rust stable and the platform's Tauri prerequisites in addition to Node and pnpm. macOS needs Xcode Command Line Tools; the bundled Node runtime requires macOS 13.5 or later. Windows and Linux native desktop builds have not been verified in the current implementation.

From the Redpact checkout, run `pnpm desktop:dev` for development. For a personal macOS installation:

```sh
pnpm desktop:update
```

This builds the current checkout, installs `/Applications/Redpact.app`, launches it, and checks health. It can replace an existing installation, so finish active work first. This is an ad-hoc signed development build, not a notarized public release. It does not update the agent plugin configuration.

The desktop owns a separate instance. Its first-launch MCP endpoint is `http://127.0.0.1:54321/mcp`; use the saved instance port if changed. Closing the window keeps the server available; quitting Redpact shuts it down. Development-server history does not automatically appear in the desktop.

Continue with [your first project](first-project.md), or see [troubleshooting](troubleshooting.md).
