# Local Redpact App Page

This package bundles the actual connected viewer and its App-only MCP bridge.
The companion retains runtime installation, start/stop and recovery. The full app
preserves project, environment, settings and Git navigation. Inline chat approval
and evidence cards use a separate MCP resource.

See [installation](../../docs/installation.md#local-redpact-app-page-experiment) for
supported host setup, trust boundaries and verification limitations.

- `pnpm build` bundles `app/web/src/entries/sidebar.tsx` and `src/redpact/main.ts`.
- `pnpm bundle:redpact` also supplies the contained Node/npm/pnpm tools.
- `pnpm test` and `pnpm typecheck` check the companion.
- `pnpm preview` runs the local MCP browser harness on port 4320.
- `pnpm test:browser` verifies the source-built runtime and viewer through that harness.

The harness does not establish native Codex Global Apps discovery. Installer tests
and the connected source smoke cover separate responsibilities; a published older
runtime is not evidence for current viewer behavior.
