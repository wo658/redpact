---
title: Troubleshooting
description: Diagnose the exact request, runtime inputs, execution and cleanup.
---

# Troubleshooting

Start with the actual instance, checkout and returned identity. Read
`get_review_context`, then the recorded result/log/source through `get_execution`.
Open its exact review path; a new request is not a way to poll an existing one.

| Observation | Check |
| --- | --- |
| MCP unavailable | Runtime health, actual MCP origin and refreshed host tool catalog |
| Settings diagnostics | Named file/field, shared primary root and selected checkout |
| Awaiting approval | Captured request and explicit human App/viewer controls |
| No assertions reached | Source collection, imports, image build and readiness |
| Assertion failed | Expected/actual value, fixture data and application behavior |
| Test finished, resources remain | Separate cleanup error and retained resource identity |
| Missing screen | Exact run/target and whether the scenario attached that PNG |

## Connection and identity

Agent and viewer must use the same instance. Regular desktop/plugin defaults to
54321; the local App Page defaults to 54322; source CLI defaults to 54318.
Data directories are separate. Plugin installation alone does not start every
runtime or refresh an already cached MCP tool catalog. See [installation](installation.md).
Do not disable Host/Origin/Fetch Metadata checks to work around a wrong endpoint.

Check instance `projects`, observed checkout bindings and `configure` diagnostics.
The shared `rulesRoot` owns settings; the execution `projectRoot` supplies source.
A linked settings copy does not override the primary. Missing checkouts preserve
history but cannot run. The host agent repairs Git/worktree paths; the viewer has
no project management or folder picker.

## Pending and stale approval

Ask requests remain pending until a person uses a supported MCP App or opens the
exact connected review. Unit/Playwright use `get_execution`; Integration also supports
`get_run`. Polling and textual agreement do not approve. If neither human interface
is available, report the limitation and keep the request pending or cancel it.
Stale revision or changed reviewed inputs require a refreshed review or a new request,
not approval of different settings. [Interfaces](interfaces.md) defines these checks.

## Settings and readiness

Repair authored JSON directly, preserving unrelated fields, then call `configure
validate` with the same checkout. Common errors are duplicate/unknown keys, unsafe
paths, missing Compose services and dependency variable collisions. Valid empty
settings do not configure an application. There is no settings-write API or editor.

Private values must be edited securely in the shared settings file, not posted in
chat. Values are literal strings with no secret reference or server-env fallback.
New requests capture new values; existing requests retain their accepted inputs.
See [configuration](configuration.md) for masking and capture limits.

A valid URL does not establish connectivity. Check Docker/Compose, image build,
health diagnostics, internal ports and the actual consuming runner. `localhost`
inside a container is that container; managed service DNS and `tests.env` must
match the application. Shared-local/remote services need explicit reachable origins.
Each execution creates its own temporary environment; old environments are not reusable.

## Collection, limits and cleanup

Integration collects exact requested tests under `tests.directory` with their helpers:
up to 50 files, 200 KB each, 2 MB total and 5000 visited entries. Symlinks are rejected.
Collected extensions are `.ts`, `.js`, `.json` plus root `pnpm-lock.yaml`; unsupported
package/config inputs can reject a bundle. Test entries end in `.test.ts`, `.test.js`,
`.spec.ts` or `.spec.js`. [Test authoring](tests.md) owns runtime/package constraints.

Unit's Dockerfile must install dependencies, copy `/workspace` and provide `/bin/sh`.
A build or import failure is not a failing assertion. Per-test timeouts differ from
instance runner limits, defaulting to 2048 MiB and 600 seconds. Inspect runaway work
before increasing limits; [execution](execution.md) describes coverage and termination.

Read cleanup separately from the test verdict. Use `cancel_execution` and supported
retry operations, then verify the observed state. General environment cleanup can
remove retained resources from older versions; no new manual Container is available.
Keep evidence and owned-resource identity when cleanup fails. Do not force-delete
edited or unrecorded drafts to bypass their cleanup checks.

For a report, include version/commit, instance, checkout, execution ID, kind and the
first failing stage. Review private data before sharing logs, settings or artifacts.
