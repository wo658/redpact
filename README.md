<p align="center">
  <img src="app/web/public/brand/icon.svg" width="96" height="96" alt="Redpact logo" />
</p>

<h1 align="center">Redpact</h1>

<p align="center"><strong>Your development workspace inside GPT.</strong></p>

<p align="center">
  <a href="https://redpact.dev/en/docs/">Documentation</a> ·
  <a href="https://redpact.dev/ko/docs/">한국어 문서</a> ·
  <a href="https://github.com/wo658/redpact/releases">Releases</a> ·
  <a href="https://github.com/wo658/redpact/issues">Report an issue</a>
</p>

Redpact is an open-source, local workspace for reviewing coding-agent work.
Follow projects and worktrees, inspect changes, run managed tests, and review
recorded evidence beside your coding conversation. A standalone browser viewer
provides the same shared UI and runtime.

**Go from an agent's completion report to the code, tests and screens behind it.**
See which checkout ran, what the tests asserted, how execution progressed, and
what the application looked like. Keep that evidence when you request another revision.

[Quick start](#quick-start) · [Features](#what-you-can-do) ·
[Workflow](#from-request-to-review) · [Documentation](#documentation) ·
[Contributing](#contributing)

## What you can do

| Capability | What you can inspect or control |
| --- | --- |
| **Project and worktree navigation** | Follow the checkout associated with a change and its execution history. |
| **Code review** | Browse files, Git changes, committed history and image previews in the shared viewer. |
| **Managed verification** | Run configured Unit commands, Vitest Integration scenarios and Playwright browser tests. |
| **Recorded evidence** | Inspect captured inputs, test source, outcomes, logs and application screenshots for a specific execution. |
| **Execution approval** | Review requests that require human approval in the connected viewer before execution. |
| **Environment management** | Configure application services and isolated, mocked or external dependencies; inspect environment state and cleanup. |

The agent handles implementation, worktree creation and Git publication through
its host tools. Redpact handles managed execution and evidence; you decide whether
the change meets the request. Read the [product scope](docs/architecture.md) and
[review walkthrough](docs/review-workflow.md) for the complete contract.

## Quick start

Choose the entry point that fits your workflow:

| Entry point | Use it when | Requirements |
| --- | --- | --- |
| **GPT / Codex App Page Plugin** | You want the workspace beside your conversation. | Compatible host on macOS Apple Silicon; npm for plugin installation. |
| **Standalone web app** | You want the viewer in your browser with a local CLI/runtime. | Node.js 24+ and npm or pnpm. |
| **Agent skills or HTTP plugins** | You want to use Redpact from another coding-agent workflow. | A separately running Redpact runtime and the agent's supported integration. |

Git is needed for repository and worktree operations. Managed test execution
additionally requires Docker with Compose and configuration for your project.

### In your coding app

Install the project-hosted plugin:

```sh
codex plugin marketplace add wo658/redpact
codex plugin add redpact@redpact
```

Restart the host, then open **Apps in sidebar → Redpact**. Choose **Install Redpact**
if the runtime is missing, then **Start Redpact** and connect your project.
The plugin bundles Node, npm, pnpm and the setup/development skills.

The App Page Plugin currently targets **macOS Apple Silicon** and compatible hosts.
It is not a public ChatGPT app-directory listing. See the
[installation guide](docs/installation.md) for packaging, host and platform limits.

### In your browser

With Node.js 24+ installed:

```sh
pnpm add --global @wo658/redpact@latest
redpact serve --port 54321 --project /absolute/path/to/your-project
```

Open **<http://127.0.0.1:54321>** and keep the server running. Replace the project
path with your actual checkout. The package includes the viewer; no source build
or separate frontend process is needed.

For npm, one-off launches, updates and other agent plugins, follow
[installation and agent connection](docs/installation.md).

### Add the agent skills

If your agent does not already have the Redpact plugin's skills:

```sh
pnpm dlx skills add wo658/redpact --skill redpact redpact-init
```

Select your agent when prompted, then start a new agent session. In Codex, invoke
`$redpact-init` to configure the project and `$redpact` with your development task.
Skills do not install or start the runtime; use the running instance from your
chosen installation path. See [standalone skills](docs/installation.md#install-skills-without-a-plugin)
for other clients and installation options.

## From request to review

1. **Connect and configure.** Open your actual repository and let the setup skill
   inspect its application, dependencies and test commands.
2. **Describe the behavior.** Ask the agent to work in an isolated worktree and
   observe a failing assertion before implementing a testable change.
3. **Run managed checks.** The agent requests Unit, Integration or Playwright
   execution through the Redpact CLI. Complete any required approval in the viewer.
4. **Review the evidence.** Open the execution link returned in chat and inspect
   its checkout, captured source, results, logs and screens.
5. **Iterate.** Ask for a revision and a new execution. Earlier evidence remains
   available for comparison.

For example, after project setup:

> Use Redpact to implement order quantity editing in an isolated worktree with TDD.
> Verify that valid changes persist after reload and invalid input preserves the
> existing order. Check the actual browser interaction and capture the initial,
> saved and error states. Return the execution links and any remaining review gaps.

### Choose the evidence your change needs

| Evidence | Best suited to |
| --- | --- |
| **Unit** | Your project's configured test command and its exit status/output. |
| **Integration** | Public API behavior and dependencies, with captured Vitest cases and observed steps. |
| **Playwright functional tests** | Browser interactions and assertions on visible behavior. |
| **Playwright captures** | Named application states for human visual review. |

Passing tests, current-source freshness and human acceptance are separate facts.
Screenshots support visual review; they do not replace behavioral assertions.
Execution approval does not accept code or authorize a commit, merge or release.
See [writing verification](docs/tests.md) and [reading results](docs/results.md).

## Working locally

The browser and agent must use the **same runtime instance** to see the same history.
The CLI defaults to port `54318`; the browser example and HTTP plugins use `54321`,
and the App Page Plugin owns `54322`.

Managed executions provision temporary test environments. External dependencies
remain external, and cleanup preserves recorded evidence. Project settings are
shared across worktrees; each execution uses the selected checkout's inputs.
See [configuration](docs/configuration.md), [execution](docs/execution.md) and
[storage](docs/storage.md) for environment and data ownership.

## Documentation

| Start here | Continue with |
| --- | --- |
| [Install and connect](docs/installation.md) | Installation paths, agents and runtime updates |
| [Connect your first project](docs/first-project.md) | Project setup and dependencies |
| [Run your first test](docs/first-run.md) | Create and inspect execution evidence |
| [Review an agent change](docs/review-workflow.md) | Follow a complete development and review workflow |
| [Read results](docs/results.md) | Interpret outcomes, captured source and screenshots |
| [CLI and MCP interfaces](docs/interfaces.md) | Agent commands and transport boundaries |
| [Troubleshooting](docs/troubleshooting.md) | Diagnose setup and execution failures |
| [Architecture](docs/architecture.md) | Product scope and implementation boundaries |

The maintained product reference lives in [`docs/`](docs/index.md), published in
[English](https://redpact.dev/en/docs/) and [Korean](https://redpact.dev/ko/docs/).
This README is the starting point; detailed settings and execution contracts live
in their linked guides.

## Contributing

Bug reports, documentation improvements and focused pull requests are welcome.
For bugs, include reproduction steps, expected behavior and relevant execution
references. Discuss larger changes in an [issue](https://github.com/wo658/redpact/issues)
before implementation.

Start with [CONTRIBUTING](CONTRIBUTING.md) and the
[development guide](docs/development.md). Develop on `dev` and target development
PRs at `dev` in `wo658/redpact`. Product documentation is maintained in English and
Korean together. See [governance](GOVERNANCE.md) for project decision-making.

## License

Copyright 2026 Redpact contributors. Licensed under [Apache-2.0](LICENSE), unless
otherwise noted. Preserve third-party licenses and notices. Contributors retain
copyright; no separate CLA is required.
