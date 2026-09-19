---
title: Installation and agent connection
description: Run a local Redpact build and connect your agent to the same instance as the viewer.
---

# Installation and agent connection

Redpact is currently an unreleased local development tool. These instructions use a source checkout. Public installers and a production update feed are not assumed to be available.

## Install the npm release

After `redpact` is published to npm, install and start the bundled server and viewer with:

```sh
pnpm add --global redpact
redpact serve --project /absolute/path/to/your-project
```

Open `http://127.0.0.1:54318` and connect your agent to `http://127.0.0.1:54318/mcp`. A separate `pnpm dev` process is unnecessary. The source-based instructions below remain available before publication and for contributors.

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
