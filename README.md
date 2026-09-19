# Redpact

A local development review tool for agent-authored test intent, submitted source
and observed execution results. The connected web/Tauri viewer reviews Git changes,
Unit commands, Vitest Integration and Playwright evidence across local checkouts.

## Install and run

Install the CLI and bundled browser viewer on macOS or Linux. The terminal
installer requires Node.js 24+, npm, curl and a SHA-256 utility:

```sh
curl -fsSL https://raw.githubusercontent.com/wo658/redpact/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
redpact serve --port 54321
```

Open <http://127.0.0.1:54321> and keep the terminal running. Add the PATH setting
to your shell profile to use `redpact` in future terminals.

Alternatively, install with Homebrew on macOS:

```sh
brew tap wo658/redpact https://github.com/wo658/redpact.git
brew install wo658/redpact/redpact
redpact serve --port 54321
```

These commands install the CLI and web viewer, not the Tauri desktop app. Managed
test execution additionally requires Docker with Compose. See the
[installation guide](docs/installation.md) ([한국어](docs/installation.ko.md)) for
npm/pnpm release URLs, Codex and Claude Code plugins, updates and supported platforms.

Download the [macOS desktop preview](https://github.com/wo658/redpact/releases/tag/desktop-preview-v0.1.0)
for Apple Silicon or Intel. See [installation](docs/installation.md) for the desktop
Homebrew Cask, CLI and agent plugins. The desktop preview is not Apple notarized.

## Documentation

The separate `redpact-web` website reads the maintained Markdown in `docs/` directly. User guides and
implementation references share that source; there is no separate internal manual.

- [English documentation](docs/index.md) / [한국어 문서](docs/index.ko.md)
- [Installation and first connection](docs/installation.md)
- [Configuration](docs/configuration.md) and [settings ownership](docs/settings-reference.md)
- [Architecture](docs/architecture.md) and [development](docs/development.md)
- [UX navigation](docs/ux-navigation.md)

Use Node 24+ and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm docs:check
# Rendering requires the separate redpact-web checkout; see the development guide.
```

See the [development guide](docs/development.md) for application setup, tests,
packaging and updates. The [Order Desk example](examples/order-desk/README.md)
provides a runnable first Integration check. Local builds and previews do not publish.

## Contributing and license

[Contributing](CONTRIBUTING.md) explains how to get started.
[Agent instructions](AGENTS.md) require documentation updates with behavior changes;
[governance](GOVERNANCE.md) defines official project decision-making.

Copyright 2026 Redpact contributors. Original code and documentation use
[Apache-2.0](LICENSE), unless otherwise noted. Preserve third-party licenses and
notices, including the web assets and vendored components. Contributors retain
copyright; no separate CLA is required. The license permits commercial use but
does not grant rights to the Redpact name or imply official endorsement.
