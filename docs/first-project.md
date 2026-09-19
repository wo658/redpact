---
title: Set up your first project
description: Connect a checkout, author shared settings, and validate an explicit environment selection.
---

# Set up your first project

Start with a running [Redpact instance and MCP connection](installation.md). Choose the actual application checkout you want to test. Redpact supports Git repositories and directory projects. A worktree identifies the concrete checkout whose application and test files execute.

## Connect the directory

Use the viewer's project connection form with your application's absolute path, or start the server with `--project /absolute/path/to/your-project`. Connected Git projects discover existing worktrees automatically; discovery does not create branches or run tests.

An agent can address an absolute checkout path directly through MCP. No separate MCP registration or submission operation is required before `run_tests`.

## Ask the agent to inspect the application

Use a request such as:

> Set up this project for Redpact managed integration tests. Call configure describe for this checkout, inspect the actual build and startup commands, dependencies and Docker files, then author the project settings. Preserve existing settings. Validate the intended service and dependency selection and report what still needs runtime verification. Do not start tests yet.

The agent should determine which Compose services run the application, which dependencies it uses, and which connection values the tests need. Missing Docker or Compose files must be authored from actual application behavior. Declaring a mock mode does not create an implementation of that mock.

For unit-only setup, request the unit Dockerfile and command instead. MCP `run_tests` runs managed Vitest integration tests; unit commands and Playwright targets use separate execution controls. See [test types and authoring](tests.md).

## Separate definitions from execution choices

The primary checkout owns one shared `.redpact/settings.json`. Linked worktrees share it. Use the `rulesRoot` returned by `configure` to locate the authoring directory; application, Compose, and test paths resolve against the selected checkout.

The settings file defines Compose files, dependencies, environment bindings, and test locations. Execution selection chooses root services and dependency modes for a run. Available mode names are `isolated`, `shared-local`, `remote`, and `mock`; configure only modes that the project actually implements.

For a project with an `app` Compose service and implemented payment mock, the selection could be:

```json
{
  "services": ["app"],
  "select": { "payments": "mock" }
}
```

Use names present in your project. A displayed dependency recommendation does not select it or establish readiness.

A checkout can save choices in `.redpact/selection.json` or through its Environment screen. An explicit run selection takes precedence over saved choices. Saving choices does not prepare containers. Shared definitions stay in `.redpact/settings.json`, without checkout-specific overrides.

## Validate before executing

Ask the agent to call `configure` with the intended checkout and selection:

```json
{
  "action": "validate",
  "path": "/absolute/path/to/your-project",
  "selection": {
    "services": ["app"],
    "select": { "payments": "mock" }
  }
}
```

Correct field and source diagnostics, then repeat validation. Validation checks authored settings and selection. It does not contact Docker, prove application health, resolve secret values, run tests, or establish human approval.

Project connection may create empty settings when the file is absent. Empty settings support inspection but do not provide an executable application environment. Existing invalid files remain available for repair.

For sensitive values, declare a secret reference and enter the value directly through the supported user interface. Do not include credential values in agent prompts or authored settings. See [configuration](configuration.md) for defaults, overrides, unsets, and secrets.

## Prepare an application inventory

Before authoring settings, record a small inventory from the repository. It helps the agent explain why each service and environment binding is necessary.

| Inspect | Record | Used for |
|---|---|---|
| Package scripts and Dockerfiles | Build command, finite test command, runtime working directory | Unit setup and application images |
| Application startup | Compose service name, listening interface, internal port, health endpoint | Managed application readiness and test connections |
| Dependency callers | Actual integrations and implemented local substitutes | Executable dependency modes |
| Existing test files | Test root, helper imports and required environment variables | Source collection and `tests.env` |
| Browser routes | A reachable route and observable ready state | Playwright scenarios and captures |

For example, “the application reads `PAYMENTS_MODE=mock` and implements that branch” supports a mock declaration. “We would like a payment mock” describes development still needed. Keep that distinction in the setup report.

## Example: a primary checkout and a feature worktree

Suppose the primary checkout is `/work/shop` and the feature checkout is `/work/shop-checkout`. Use the feature path in `configure` and `run_tests` when reviewing the feature.

| Input | Location in this example |
|---|---|
| Shared Redpact definitions | `/work/shop/.redpact/settings.json` |
| Feature's execution choices | `/work/shop-checkout/.redpact/selection.json` |
| Compose file declared as `compose.yaml` | `/work/shop-checkout/compose.yaml` |
| Integration source declared as `tests/http.test.ts` | `/work/shop-checkout/tests/http.test.ts` |

Use the returned `rulesRoot` instead of guessing the primary checkout from a folder name. A valid shared setting can still fail for a feature worktree if that worktree lacks its referenced Compose service or test source. Validate against the feature path after editing those inputs.

## Review the setup report

A useful report names the shared settings file, execution checkout, available test types, chosen services and dependency modes, and any missing prerequisites. It should also identify the first scenario to execute and explain what that scenario will establish.

For example: “The payment mock is implemented and selected; settings validate. The first integration scenario checks the checkout response through `APP_URL`. Docker preparation and that assertion have not run yet.” This gives you a concrete next action without presenting static configuration as a successful test.

## Finish setup

Before the first run, identify the checkout, validate shared settings with an explicit selection, and place test sources under the configured directory. Docker readiness and application health remain unverified until execution observes them.

Continue with [your first managed test run](first-run.md).
