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
      "env": { "app": { "API_KEY": "replace-with-your-local-value" } }
    }
  },
  "tests": {
    "directory": "integration",
    "env": { "APP_URL": "http://app.redpact.test:3000" }
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

Compose remains the execution definition; settings validation does not impose a
restricted Compose subset. See [Compose and source capture](execution.md#compose-and-source-capture)
for ownership, runtime input capture and native startup error handling.

## Environment and connections

Dependency `env` is keyed by destination Compose service and variable. Strings override
values; omission preserves defaults; `{ "unset": true }` removes a variable. Conflicting
writes from two dependencies fail even if their values are equal. Environment bindings
do not start their target service.

`tests.env` is the common Integration and Playwright runner environment. Declare only
runner variables that tests need; application variables are not copied. All values are
plain strings. There is no secret, host, port or URL value type, reference lookup or
server-environment fallback. Write URLs and ports as strings yourself, for example
`"APP_URL": "http://app.redpact.test:3000"`. Managed services have
`<service>.redpact.test` DNS aliases on the execution network; host published ports
remain separate inspection endpoints.

The host agent or user edits JSON values in the shared `.redpact/settings.json`.
Redpact supplies inspection and validation, with no settings editor or write API.
There is no separate credential store or input card. Empty strings, whitespace,
`=` and `$` are literal; JSON `\n` represents a newline. There is no dotenv parser,
shell expansion or automatic `.env` discovery.

Every nonempty application/test value is masked in execution text, including application
shutdown logs. Browser runs with any such value omit traces. Values are matched
literally, longest first; short values can mask ordinary log text too. Accepted
execution settings fix values for that execution; later edits affect future runs only.

Values remain plaintext in settings, their read APIs and captured configuration or
source. Masking is not encryption and does not sanitize these records, screenshots or
video. Keep sensitive settings out of Git/public exports.

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

Secret references and typed service endpoints are also retired. Replace them in authored
settings with explicit string values. Historical runtime records use the ordered
[storage migration](storage.md); project settings are never rewritten automatically.

Mode catalogs, execution-time selection, integration default files and worktree
dependency overlays are retired. Rewrite existing settings manually with fixed roots
and dependency definitions. There are no backward readers or automatic migrations.
The old selection and overlay files do not affect the plan.

## File ownership and setup

`configure describe` reports `rulesRoot` (the shared primary application root),
`projectRoot` (the selected execution checkout) and the instance settings location.
Inspect existing manifests, Dockerfiles, Compose services and tests before authoring.
Write one fixed plan at `rulesRoot/.redpact/settings.json`, preserving unrelated fields.
A linked worktree's own settings copy does not override the primary file.

The primary `.redpact/tracking.json` retains read-only discovery/baseline preferences
such as `mainBranch`, `hideMerged` and `showBranches`. The viewer does not edit it.

Instance `projects` contains absolute directories to observe. Edit that file directly
when observation is needed, then verify the actual binding with `get_workspace_status`
or the advertised read-only project/worktree API. Saving an observation path or passing
validation alone does not establish successful discovery. Existing-checkout binding
never creates a Git worktree or initializes project settings.

HTTP, MCP and execution use the same strict validation. Paths must be normalized
project-relative paths. Duplicate/unknown keys and dependency variable collisions fail.
Compose service names are nonempty strings; dependency and target identifiers use
the schema's lowercase identifiers. Use the generated schema for exact constraints.

Execution captures settings separately from checkout inputs. Ask requests retain
policy and input identities; later settings changes cannot silently replace approved
inputs. [Execution](execution.md) owns freshness checks and their limits.
Runtime snapshots use ordered [storage migrations](storage.md); authored project
settings have no compatibility migration or automatic rewrite.

## Instance settings

Edit the instance file identified by `configure describe`. `server.port` applies
after restart. `approval` controls future requests; changing it does not approve
pending requests. App-only human policy controls retain their capability boundary.

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
