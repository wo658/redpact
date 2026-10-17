---
title: Set up your first project
description: Connect a checkout, author shared settings, and validate the fixed environment configuration.
---

# Set up your first project

Start with a running [Redpact instance and MCP connection](installation.md). Choose the actual application checkout you want to test. Redpact supports Git repositories and directory projects. A worktree identifies the concrete checkout whose application and test files execute.

## Connect the directory

Use the viewer's project connection form with your application's absolute path, or start the server with `--project /absolute/path/to/your-project`. Connected Git projects discover existing worktrees automatically; discovery does not create branches or run tests.

An agent uses `redpact projects connect --path /absolute/checkout` when connection is
needed, then passes that same `--path` to CLI operations. GUI selection never changes
the CLI target. Use native Git for checkout and branch operations.

Connecting an existing checkout preserves authored settings and leaves a missing `.redpact/settings.json` absent. Discovery and tracking reads do not initialize or repair files. Use CLI settings patches and validation; agents never directly read or edit settings JSON.

## Ask the agent to inspect the application

Use a request such as:

> Set up this project for Redpact managed integration tests. Call redpact settings describe --scope project for this checkout, inspect the actual build and startup commands, dependencies and Docker files, then use settings get and revision-checked settings patch to update project settings. Preserve existing settings. Validate the fixed service and dependency configuration and report what still needs runtime verification. Do not start tests yet.

The agent should determine which Compose services run the application, which dependencies it uses, and which connection values the tests need. Missing Docker or Compose files must be authored from actual application behavior. Declaring a mock dependency does not create an implementation of that mock.

For unit-only setup, request the unit Dockerfile and command instead. `redpact tests run --kind integration` runs managed Vitest integration tests; use `--kind unit` for Unit commands and `--kind playwright --target TARGET` for Playwright. See [test types and authoring](tests.md).

## Define one fixed execution configuration

The primary checkout holds `.redpact/settings.json`; `redpact settings describe --scope project --path /absolute/checkout` reports its `rulesRoot`.
All worktrees share root services, fixed dependency definitions and explicit runner
variables. Compose, Dockerfile and test paths resolve in the executing checkout.
Use the [configuration contract](configuration.md) to declare actual implemented
services. Kind names do not install infrastructure or implement mocks.

## Validate the actual checkout

Run `redpact settings validate --scope project --path /absolute/path/to/project`.
Repair reported file and field diagnostics, then validate again. This checks the fixed
configuration and its Compose plan. It does not contact services, resolve credentials,
run tests or grant approval. Verify readiness and each consumer's connectivity during
managed execution. Existing settings require the manual changes described in
[configuration](configuration.md#incompatible-settings-change).

Continue with [your first recorded test](first-run.md).
