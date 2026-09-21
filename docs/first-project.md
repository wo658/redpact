---
title: Set up your first project
description: Connect a checkout, author shared settings, and validate the fixed environment configuration.
---

# Set up your first project

Start with a running [Redpact instance and MCP connection](installation.md). Choose the actual application checkout you want to test. Redpact supports Git repositories and directory projects. A worktree identifies the concrete checkout whose application and test files execute.

## Connect the directory

Use the viewer's project connection form with your application's absolute path, or start the server with `--project /absolute/path/to/your-project`. Connected Git projects discover existing worktrees automatically; discovery does not create branches or run tests.

An agent can address an absolute checkout path directly through MCP. No separate MCP registration or submission operation is required before `run_tests`.

## Ask the agent to inspect the application

Use a request such as:

> Set up this project for Redpact managed integration tests. Call configure describe for this checkout, inspect the actual build and startup commands, dependencies and Docker files, then author the project settings. Preserve existing settings. Validate the fixed service and dependency configuration and report what still needs runtime verification. Do not start tests yet.

The agent should determine which Compose services run the application, which dependencies it uses, and which connection values the tests need. Missing Docker or Compose files must be authored from actual application behavior. Declaring a mock dependency does not create an implementation of that mock.

For unit-only setup, request the unit Dockerfile and command instead. MCP `run_tests` runs managed Vitest integration tests; unit commands and Playwright targets use separate execution controls. See [test types and authoring](tests.md).

## Define one fixed execution configuration

The primary checkout holds `.redpact/settings.json`; `configure` reports its `rulesRoot`.
All worktrees share root services, fixed dependency definitions and explicit runner
variables. Compose, Dockerfile and test paths resolve in the executing checkout.
Use the [configuration contract](configuration.md) to declare actual implemented
services. Kind names do not install infrastructure or implement mocks.

## Validate the actual checkout

Call `configure` with `{"action":"validate","path":"/absolute/path/to/project"}`.
Repair reported file and field diagnostics, then validate again. This checks the fixed
configuration and its Compose plan. It does not contact services, resolve credentials,
run tests or grant approval. Verify readiness and each consumer's connectivity during
managed execution. Existing settings require the manual changes described in
[configuration](configuration.md#incompatible-settings-change).

Continue with [your first recorded test](first-run.md).
