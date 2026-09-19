# Redpact

A local development review tool for agent-authored test intent, submitted source
and observed execution results. The connected web/Tauri viewer reviews Git changes,
Unit commands, Vitest Integration and Playwright evidence across local checkouts.

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
