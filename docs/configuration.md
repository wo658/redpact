---
title: Project configuration
description: Configure test runners, dependency modes, environment values, and worktree choices.
---

# Project configuration

Redpact uses one `.redpact/settings.json` in the primary checkout. Linked worktrees share this file. Compose files, Dockerfiles, and tests resolve inside the execution checkout. Directory projects use their own root for both purposes.

Ask your agent to call `configure` with `action: "describe"` and the absolute checkout `path`. The response identifies `rulesRoot`, where shared settings belong, and `projectRoot`, where execution inputs live. Edit the shared file, then call `configure` with `action: "validate"` and the same path. Include a selection to check its plan. These calls do not start tests or establish service readiness.

## Minimal settings

This is a valid empty configuration:

```json
{
  "composeFiles": [],
  "dependencies": {}
}
```

It supports inspection. Managed integration and Playwright execution need a Compose application; unit commands can use `unitTests` without Compose. Connecting a project creates missing shared settings with empty catalogs and integration defaults. Existing files are preserved, including invalid ones.

`redpact-init` completes the applicable settings from the connected runtime's schema:
explicit empty catalogs, Integration defaults, and every defaulted field of enabled
Unit and Playwright capabilities. Required services, ports, commands and paths use
actual project values. Empty values are written only where valid; capabilities with
missing required inputs stay unconfigured and are reported. Existing explicit values
and omitted application environment bindings are preserved. Plugin installation does
not run project init or update the connected runtime.

If `uiLanguage` is rejected, check the diagnostic path: the field belongs under
`playwright`, not at the project root or in instance preferences. If the connected
`configure describe` lacks `playwright.uiLanguage`, the runtime does not support the
current contract. Update the appropriate runtime and reconnect before using that
field; reinstalling only the plugin does not resolve a runtime schema mismatch.

For a project with `compose.yaml` containing an `app` service that publishes TCP port 3000:

```json
{
  "composeFiles": ["compose.yaml"],
  "dependencies": {},
  "tests": {
    "directory": "integration",
    "env": {
      "APP_URL": { "service": "app", "port": 3000, "scheme": "http" }
    }
  }
}
```

The service must exist and listen on a reachable interface. Your tests explicitly read the example `APP_URL` variable. Redpact resolves its allocated host port during preparation; do not save allocated ports in settings. This declaration is not a standalone runnable application.

## Fields and defaults

| Field | Purpose and omitted default |
| --- | --- |
| `composeFiles` | Ordered project-relative Compose paths; `[]`. |
| `dependencies` | Dependency catalog keyed by name; `{}`. |
| `applicationServices` | Optional named application nodes mapped to Compose services. |
| `relationships` | Optional authored application calls with source evidence; descriptive only. |
| `tests.directory` | Git-tracked integration source bundle directory; `integration`. Unit patterns cannot include this directory. |
| `tests.timeoutMs` | Individual integration test/hook timeout; 10000 ms, allowed 1–60000. |
| `tests.env` | Host integration variables; `{}`. Strings, secret references, or service URLs. |
| `unitTests` | Optional required `dockerfile`, `command`, and `patterns`; `cwd` defaults to `.`. |
| `playwright` | Optional application connection, named browser targets, and browser settings. |

Supply normalized project-relative paths: the validator rejects `./`, `..`, absolute paths and backslashes rather than rewriting them. `unitTests.cwd` also accepts the literal `.`. Unknown fields and duplicate JSON keys are errors. Preserve omitted defaults when editing. There is no alternate format, settings version selector, or linked-worktree override.

Unit commands run in a temporary container built from the selected checkout. The Dockerfile supplies `/workspace`, dependencies, and `/bin/sh`; `cwd` selects a directory below `/workspace`. Use a finite command. Patterns control browsing; the command determines what executes. See [unit commands](execution.md).

Playwright requires `service`, `port`, and a nonempty `targets` map. Each target has `purpose` (`capture` or `functional`), `testMatch` patterns, and `scope` (`project` by default, or `worktree`). Defaults are `directory: "ui-tests"`, HTTP, 1920 × 1080, `en-US`, UTC, light appearance, no video, and a 30000 ms test timeout. Scope controls maintenance lifetime independently of purpose. See [Playwright configuration](execution.md).

## Dependency modes

Each dependency declares executable definitions under `modes`:

| Mode | Meaning |
| --- | --- |
| `isolated` | Runs actual dependency Compose services; requires nonempty `services`. |
| `mock` | Uses an implemented substitute in application code or a mock server. May add services, overrides, or both. |
| `shared-local` | Connects to an existing local real service; must not provision services. |
| `remote` | Connects to an existing Cloud or remote real service; cannot declare services. |

A mode flag does not implement mocking. Sandbox and staging endpoints belong to `remote`, not new mode names. `assessments` can describe unavailable or unfinished options. A `recommendation` never selects a mode.

A dependency definition at `dependencies.payments` could be:

```json
{
  "modes": {
    "remote": {
      "env": {
        "app": {
          "PAYMENTS_URL": "https://payments.example.com",
          "PAYMENTS_API_KEY": { "secret": "PAYMENTS_API_KEY" }
        }
      }
    }
  }
}
```

This block is a dependency definition, not a complete settings file. Replace the illustrative endpoint and variables with your application's contract. Mode `env` is keyed by destination Compose service, then variable. Omitted `services` and `env` default to `[]` and `{}`. Overrides do not activate their destination service; it must be active in the selected plan.

## Environment values and secrets

A string replaces a container variable. Omission preserves its default. `{ "unset": true }` removes it explicitly. Two selected modes modifying the same service variable conflict even when their values match.

Use `{ "secret": "KEY_NAME" }` for sensitive values. Your agent declares the reference; you enter the value directly in Project Dependencies or a credential card when supported by the connected client. Plain strings remain visible, even for variables named `TOKEN` or `PASSWORD`.

Project secret values are shared across its worktrees in that instance. They override same-named server environment values; an explicitly saved empty value disables fallback. Replacements affect new environments. Existing environments retain privately captured values. Selected secret values are redacted from execution text, and secret-bearing Playwright runs omit trace archives. Images, video, and authored source are not scanned for credentials.

`tests.env` supports strings, secret references, and service URLs. Container `{ "unset": true }` bindings are not supported there. Container-to-container URLs remain ordinary Compose-network addresses, such as `http://payments:8080`.

## Worktree selection

The catalog describes available modes. `.redpact/selection.json` in the execution checkout chooses root services and exactly one mode for each dependency:

```json
{
  "services": ["app"],
  "select": { "payments": "remote" }
}
```

For no dependencies, use `"select": {}`. Use the worktree Environment screen or supply `selection` to `run_tests`. Accepted new-environment requests remember their choices. Omission uses saved choices; the first request needs selection if none exists. Invalid saved choices fail instead of silently choosing replacements.

The active services are the roots, selected mode services, and fixed Compose `depends_on` prerequisites. A dependency meant to disappear in mock mode should not be an unconditional prerequisite. Saving choices starts nothing. Every execution creates a fresh temporary environment. Shared local infrastructure can use shared-local mode; Redpact does not manage its lifetime.

## Worked example: an application with a payment mock

This complete settings example assumes your `compose.yaml` already defines an `app` service listening on port 3000 and publishing that TCP port. It also assumes the application implements `PAYMENTS_MODE=mock`. It is a template for that application contract; use the [Order Desk walkthrough](first-run.md) for the supplied runnable sample.

```json
{
  "composeFiles": ["compose.yaml"],
  "dependencies": {
    "payments": {
      "modes": {
        "mock": {
          "env": {
            "app": { "PAYMENTS_MODE": "mock" }
          }
        }
      }
    }
  },
  "tests": {
    "directory": "integration",
    "env": {
      "APP_URL": { "service": "app", "port": 3000, "scheme": "http" }
    }
  },
  "playwright": {
    "service": "app",
    "port": 3000,
    "directory": "ui-tests",
    "locale": "en-US",
    "uiLanguage": "en",
    "targets": {
      "project-captures": {
        "scope": "project",
        "purpose": "capture",
        "testMatch": ["project/captures/**/*.ts"]
      },
      "project-tests": {
        "scope": "project",
        "purpose": "functional",
        "testMatch": ["project/tests/**/*.ts"]
      }
    }
  }
}
```

Select `services: ["app"]` and `select: { "payments": "mock" }`. The application receives `PAYMENTS_MODE=mock`. Host Integration tests receive the allocated application URL as `APP_URL`. Playwright uses its configured application service and port for relative navigation; it does not inherit `tests.env`.

### Playwright UI language

`playwright.locale` configures Chromium's browser locale. `playwright.uiLanguage` is the
two- or three-letter language used by the application's Playwright UI labels; it defaults
to `en` and is passed to every scenario as `REDPACT_UI_LANGUAGE`. Set it explicitly for
single-language applications, for example `"ko"` with `"ko-KR"`. Scenario helpers must
initialize the application with that value before `page.goto`, then use locators in the
same language. Do not infer UI labels from the browser locale: applications may use
browser preferences, storage, a cookie, URL routing, or no localization at all.

To adapt this example, replace the Compose path, service name, port, application variable and test paths together. Remove the Playwright block if browser execution is not part of this project. Add only dependency modes supported by real code or an existing service, then validate the intended checkout and selection.

## Choose the right place for a value

| Value | Put it here | Example |
|---|---|---|
| Application's normal startup default | Compose or the application image | A default logging level |
| A selected dependency's effect on a container | `dependencies.<name>.modes.<mode>.env.<service>` | `PAYMENTS_MODE` on `app` |
| A URL consumed by host Integration tests | `tests.env` service binding | `APP_URL` mapped from `app:3000` |
| Browser application entry point | `playwright.service` and `playwright.port` | Relative `page.goto` requests |
| Browser UI label language | `playwright.uiLanguage` | `ko` for Korean application locators |
| This checkout's chosen services and modes | `.redpact/selection.json` | `payments: mock` |
| Execution memory and wall-time budget | Instance `testResources` | 2048 MiB and 600 seconds |

Inside a container, `localhost` refers to that container. Use the dependency's Compose name for another container, such as `http://payments:8080`. Host Integration tests need the published mapping provided by a service binding. These addresses serve different callers and are not interchangeable.

## Change a mode without inheriting the wrong default

Omitting a variable preserves it. If Compose defines a real-provider URL, selecting a mock mode does not automatically remove that URL. The application may still use it unless the mock implementation ignores it or the mode explicitly overrides or unsets it.

For a variable that must be absent in mock mode, add `{ "unset": true }` at that container variable's binding. Validate the plan and inspect which variables it overrides or removes. If two selected dependencies change the same service variable, resolve the ownership conflict in settings; selection order will not choose a winner.

After changing settings or application inputs, start a new test execution to prepare its temporary environment. Existing environments preserve the configuration they started with. A successful save or validation does not update their running processes.

## Instance settings

Global Settings controls the instance separately. `configure describe` reports that settings file's location. Instance `projects` lists absolute directories to observe. `server.port` applies after restart. Optional `github.cliPath` selects an absolute GitHub CLI executable.

Per-execution limits belong in that instance file:

```json
{
  "testResources": {
    "memoryMiB": 2048,
    "timeoutSeconds": 600
  }
}
```

These omitted defaults apply to subsequent managed unit, integration, and Playwright executions. Memory allows 64–1048576 MiB; time allows 1–86400 seconds. They are separate from per-test timeouts and do not limit application containers, builds, or direct shell test commands. See [resource coverage](execution.md).

## Agent tools

| Tool | Input and role |
| --- | --- |
| `configure` | `action: "describe"`, `"inspect"`, or `"validate"`; absolute checkout `path`. `selection` is allowed only for `inspect` and `validate`; these actions do not read saved choices automatically. Reads schema, settings, diagnostics, and plan. |
| `run_tests` | Absolute `path`; optional exact `tests` paths relative to `tests.directory`; `selection` or saved worktree choices. Starts managed integration execution. |
| `get_run` | Returned `id`. Reads state, results, and environment cleanup status. |
| `request_keys` | Observed `projectId` and declared missing credential `names`. Returns availability and requests direct user input when supported. |

MCP `run_tests` does not execute unit commands or Playwright targets; use their viewer controls or HTTP. Early cancellation and cleanup retries belong to user web controls. See the [complete settings contract](configuration.md) and [settings ownership](settings-reference.md).

## Advanced ownership

See [settings ownership](settings-reference.md) for primary/worktree file resolution, scoped dependency overrides, project Integration defaults and reviewed promotion. See [execution](execution.md) for manual Container lifetime and cleanup.
