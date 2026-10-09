# Local MCP App examples

Setup, installation, verification and limitations are maintained in the product documentation:

- [Sidebar Lab](../../docs/installation.md#local-sidebar-app-experiment): an independent counter that checks the MCP Apps bridge.
- [Redpact App Page](../../docs/installation.md#local-redpact-app-page-experiment): an independent manager MCP that installs the runtime with npm or pnpm, controls it, and presents review evidence.

`build.mjs` builds Sidebar Lab. `build-redpact.mjs` builds the companion from
`src/redpact/`. Neither browser harness establishes Global Apps discovery in Codex.
