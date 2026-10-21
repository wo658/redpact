# Redpact App Page Plugin

This package bundles the actual connected viewer and its App-only MCP bridge.
The companion retains runtime installation, start/stop and recovery. The full app
preserves project, environment, settings and Git navigation. Chat MCP returns structured evidence and web review links without inline cards.

See [installation](../../docs/installation.md) for
supported host setup, trust boundaries and verification limitations.

- `pnpm build` bundles `app/web/src/entries/sidebar.tsx` and `src/redpact/main.ts`.
- `pnpm bundle:redpact` also supplies the contained Node/npm/pnpm tools.
The public catalog `.agents/plugins/marketplace.json` supplies the generated package
and Plugin versions. From the repository root, `pnpm plugins:check --registry` checks
that the catalog matches the published npm `latest` version. See
[Plugin distribution](../../docs/development.md#public-installation-distribution) for release ordering.

- `pnpm pack:plugin` creates the public `@wo658/redpact-plugin` npm tarball and provenance.
- `pnpm test:package` verifies the extracted tarball, bundled tools and MCP resources.
- `pnpm test` and `pnpm typecheck` check the companion.
- `pnpm preview` runs the local MCP browser harness on port 4320.
- `pnpm test:browser` verifies the source-built runtime and viewer through that harness.

The harness does not establish native Codex Global Apps discovery. Installer tests
and the connected source smoke cover separate responsibilities; a published older
runtime is not evidence for current viewer behavior.
