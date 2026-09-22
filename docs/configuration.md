---
title: Project configuration
description: One fixed project configuration for managed services, external connections and test runners.
---

# Project configuration

All worktrees use the primary checkout's `.redpact/settings.json`. The selected
execution checkout supplies Compose files, Dockerfiles, application source and tests.
Sharing configuration does not share execution resources: each run creates and removes
its own application containers, dependency containers and network.

Call `configure describe` with the absolute execution path for the generated schema.
Edit the shared settings, then call `configure validate` with the same path. Validation
returns the fixed plan without starting anything or proving readiness or approval.

## Fixed execution plan

```json
{
  "composeFiles": ["compose.yaml"],
  "services": ["app"],
  "dependencies": {
    "database": { "kind": "isolated", "services": ["db"] },
    "payments": {
      "kind": "mock",
      "services": ["payments"],
      "env": { "app": { "PAYMENTS_URL": "http://payments:8080" } }
    },
    "search": {
      "kind": "shared-local",
      "env": { "app": { "SEARCH_URL": "http://host.docker.internal:9200" } }
    },
    "provider": {
      "kind": "remote",
      "env": { "app": { "API_KEY": { "secret": "API_KEY" } } }
    }
  },
  "tests": {
    "directory": "integration",
    "env": { "APP_URL": { "service": "app", "port": 3000, "scheme": "http" } }
  }
}
```

The example requires actual Compose services and reachable existing endpoints. A mock
declaration does not implement a substitute. `services` declares fixed roots;
managed dependency services and Compose prerequisites complete the plan. Application
metadata and relationships describe topology without activating extra services.

Each dependency has exactly one `kind`: `isolated`, `mock`, `shared-local` or `remote`.
Isolated dependencies require services. Mock dependencies use implemented application
behavior, managed services, or both. External connections cannot declare services and
are never started or removed by Redpact. Shared services need fixture isolation for
concurrent executions.

## Environment and connections

Dependency `env` is keyed by destination Compose service and variable. Strings override
values; omission preserves defaults; `{ "unset": true }` removes a variable. Conflicting
writes from two dependencies fail even if their values are equal. Environment bindings
do not start their target service.

`tests.env` is the common Integration and Playwright runner environment. Declare only
runner variables that tests need; application variables are not copied. Values may be
strings, secret references, or managed service URLs. Both runners resolve managed URLs
using `<service>.redpact.test` DNS aliases and internal ports on the execution network. Host published ports
remain separate inspection endpoints.

Use `{ "secret": "KEY_NAME" }` and enter credentials through the project credential
controls or `request_keys`. Do not submit credential values through the agent. Project
values override server values; an explicitly empty project value disables fallback.
Resolved secrets are redacted from execution text; secret-bearing browser runs omit
traces. Source, screenshots and video are not scanned for secrets.

Inside a container, localhost is that container. A host-local service must be reachable
from the runner and application that consume it. Merely changing an address does not
prove connectivity; loopback-only host services require an accessible connection path.
Remote endpoints retain their real origins, TLS and authentication. Browser-to-API
access must also satisfy the application's CORS and cookie rules.

## Runner declarations

`tests.directory` defaults to `integration`; `tests.timeoutMs` defaults to 10000.
Unit uses its existing `unitTests` Dockerfile, complete command, cwd and patterns.
Playwright requires an application `service`, `port` and named `targets` with purpose
`functional` or `capture`, and scope `project` or `worktree`. Browser language is
`playwright.locale`; scenario UI language is `playwright.uiLanguage`, supplied as
`REDPACT_UI_LANGUAGE`. See [execution](execution.md) for execution and cleanup.

Settings are strict JSON with normalized project-relative paths, no duplicate or
unknown keys, imports or format selector. Empty settings support inspection. Managed
application execution requires configured roots and Compose services.

## Incompatible settings change

Mode catalogs, execution-time selection, integration default files and worktree
dependency overlays are retired. Rewrite existing settings manually with fixed roots
and dependency definitions. There are no backward readers or automatic migrations.
The old selection and overlay files do not affect the plan. See
[settings ownership](settings-reference.md) for file ownership and captured inputs.

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
