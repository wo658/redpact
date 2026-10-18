# Redpact

**Redpact — your development workspace inside GPT.**

Use Redpact as an in-app workspace beside your coding conversation. Open projects,
worktrees, files, Git changes, tests and environments without leaving the app.
The current implementation is a **GPT / Codex App Page Plugin**; it is not
a listing in the public ChatGPT app directory. Supported installation paths are npm/pnpm for the web app and Plugins. Native desktop distribution has ended.

Start with the [in-app setup](docs/installation.md): open Redpact,
choose **Install Redpact** when the runtime is missing, then **Start Redpact**.
The plugin bundles Node, npm and pnpm; managed tests additionally need Docker.

Ask your coding agent to implement a change with TDD in an isolated worktree.
Redpact runs managed Unit, Integration and Playwright verification and records the
inputs, outcomes, source and application screens for review. The conversation and
viewer refer to the same execution; a passing result is separate from current-code
freshness and human acceptance.

[Documentation](https://redpact.dev/en/docs/) · [Korean documentation](https://redpact.dev/ko/docs/) · [Installation](docs/installation.md) · [Report an issue](https://github.com/wo658/redpact/issues)

1. [Open Redpact in the app](docs/installation.md) and install/start its local runtime.
2. [Configure your actual project](docs/configuration.md).
3. Ask the agent to write a failing test, implement the behavior and request managed
   checks through the Redpact CLI. Use subagents for independent work when useful.
4. Open the exact execution review link returned in chat. Inspect the captured
   inputs, evidence and worktree-bound history, then make any required decision.

The full Redpact app keeps project/worktree management, files and diffs, Git, test catalogs, environments and settings in the browser and App Page. Chat MCP returns structured results and web review links; execution approval stays in the connected viewer. Exact execution links open inside the full app.

> Use Redpact to implement quantity editing in a worktree with TDD. Check valid
> persistence and invalid-input rejection, verify the real browser interaction,
> and record desktop and mobile screens. Return the actual execution references
> and remaining review gaps.

Start with the [review walkthrough](docs/review-workflow.md), [results](docs/results.md) and [CLI and MCP contracts](docs/interfaces.md).
The App Page package includes the development/setup skills and connects its viewer
and model tools to one runtime; its installation and host limitations are documented
in the [installation guide](docs/installation.md).

## Contributing

Read [CONTRIBUTING](CONTRIBUTING.md), [development](docs/development.md) and
[governance](GOVERNANCE.md). Product and implementation documentation is maintained
in English and Korean under `docs/`.

Copyright 2026 Redpact contributors. Licensed under [Apache-2.0](LICENSE), unless
otherwise noted. Preserve third-party licenses and notices. Contributors retain
copyright; no separate CLA is required.
