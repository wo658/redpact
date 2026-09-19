# Redpact

A local development review tool with a bundled web viewer, HTTP/MCP server and
recorded Vitest test evidence.

## Requirements

- Node.js 24 or newer and pnpm.
- Git for repository inspection and worktrees.
- Docker with Compose v2 for managed test execution.

## Install and start

After the package has been published to npm:

```sh
pnpm add --global redpact
redpact serve --project /absolute/path/to/your-project
```

For a one-off launch:

```sh
pnpm dlx redpact serve --project /absolute/path/to/your-project
```

Open `http://127.0.0.1:54318` for the bundled viewer. No source checkout or separate
`pnpm dev` process is required. Keep the server running while using the viewer or
agent. Stop it with Ctrl+C. Use `redpact serve --help` for launch options.

Connect your agent using Streamable HTTP at `http://127.0.0.1:54318/mcp`.
Redpact defaults to loopback and requires no API token. The desktop app uses a separate
instance, normally on port 54321; connect the viewer and agent to the same instance.

Ask your agent to inspect your project with `configure describe`, author
`.redpact/settings.json`, and call `configure validate`. Validation does not prepare
services or execute tests. Every managed execution owns temporary resources and
cleans them up after completion. Shared infrastructure can be selected as external
dependencies. Missing Docker or requested services never silently fall back to host
execution.

The server retains settings and review evidence in its instance data directory.
Use `--data-dir /absolute/path/to/state` to choose it. Only one process may own that
directory at a time; reuse it on restart to preserve history.

## Install a release tarball

Before registry publication, or to verify a locally built release:

```sh
pnpm add --global /absolute/path/redpact-0.1.0.tgz --ignore-scripts
redpact serve --project /absolute/path/to/your-project
```

No installation scripts are required. The package includes the server, viewer,
runner assets and patched Testcontainers dependency. Bundled third-party software
retains its licenses; see `LICENSE`, `NOTICE`, `licenses`, and the runtime asset
license directories.

Documentation and source: https://github.com/wo658/redpact

## Container listener

Run `redpact serve --host 0.0.0.0` inside a container to accept traffic from its
published port. Publish that port on the host's loopback, for example Docker
`-p 127.0.0.1:54318:54318`, then open `http://127.0.0.1:54318` on the host.
The self-E2E image supplies this listener option. Ordinary launches default to
`127.0.0.1`; desktop control requires it. Host, Origin and Fetch Metadata checks
remain active. No authentication or remote/shared-user access is introduced.

Manual Container Start checks declared HTTP/HTTPS endpoints from the host after
container healthchecks. Failed access prevents Ready; inspect preparation.log for
the service and listener diagnostic. An HTTP error response still proves access,
and redirects are not followed. Ports without web declarations use Compose health
checks. Configure other applications' container listeners in their own startup settings.
