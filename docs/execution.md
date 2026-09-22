---
title: Execution and environments
description: Test runtimes, evidence, manual containers, limits and cleanup.
---

# Execution and environments

## Runtime ownership

| Entry | Runtime and inputs | Result |
| --- | --- | --- |
| Unit | Project Dockerfile and complete configured command in a temporary container | Command status, exit code, stdout/stderr and cleanup status |
| Integration | Containerized Vitest against a fresh Testcontainers Compose application environment | Immutable submitted source, cases, steps and run/environment records |
| Playwright | Containerized browser against a temporary application environment | Functional results or capture evidence, optional video/trace |
| Container | Explicitly started manual project application environment | Inspection endpoints and lifecycle state; not test evidence |

Unit has no host-command fallback. Its Dockerfile must copy sources and dependencies
into `/workspace`, provide `/bin/sh`, and install during build. `cwd` selects the
command directory. Dockerfile ENTRYPOINT/CMD do not supply Redpact's supervisor.
The selected source file does not filter the configured command. Results do not
invent per-case verdicts from an exit code.

Integration uses the current project catalog when started from Project Tests, or
the latest submitted bundle when started from worktree review. MCP `run_tests`
collects fresh sources for the supplied path. Submission identity and current file
contents must remain distinguishable in the viewer. [Test authoring](tests.md)
describes supported source collection and assertions.

The three entries are separate execution contracts. MCP `run_tests` admits only
Integration submissions. Unit runs start from the Unit tab and execute the complete
configured command; their exit status is not an Integration case result. Playwright
runs start by selecting a declared functional or capture target in the Playwright
UI/API. Their screenshots, UI-review artifacts, execution record and cleanup stay
with that Playwright run rather than an MCP submission.

For agent-mediated verification, direct Docker/Compose, Vitest or Playwright CLI
commands are local diagnostics, not Redpact execution evidence. Start each selected
path through its entry above so the connected worktree retains its result and cleanup.

## Temporary lifecycle

A run is queued before application preparation. Its environment binding may appear
later. Each execution owns a fresh environment; it cannot reserve another run's
completed environment. Public standalone preparation and `environmentId` reuse are
not supported. A run environment proceeds through preparation, readiness, use,
completion and removal, retaining diagnostics on failure.

Success, assertion failure, preparation failure, cancellation and interruption all
request cleanup. Stop blocks admission, confirms execution cancellation, then removes
owned containers, networks, volumes, per-run Unit images, temporary Compose build images and captured runtime
source. Integration and Playwright keep their shared runner images; temporary application images belong to
the run environment and are removed with it. Preserve metadata, logs, results and shared Docker build caches. A cleanup failure is `stop_failed`, distinct
from the test verdict, and remains retryable. Startup reconciles labelled resources
and removes interrupted environments; it never reruns tests automatically.

Before starting a temporary Compose environment, Redpact assigns every selected
build service an environment-owned image tag, including services that declare both
`build` and `image`. It overrides additional build tags and captures these temporary
tags in an image-cleanup manifest. Cleanup does not re-evaluate original Compose files,
inactive services or required environment expressions. Existing project image tags and
image-only dependencies are preserved; no application credentials are needed again.
Unit build images carry owner/run labels so cleanup also finds them when container
startup fails before an image ID is recorded.

Playwright reuses its shared browser image when the Dockerfile and bundled reporter
assets have the same digest. Warm captures skip the browser image build. Each capture
still starts a fresh browser container and fresh application environment; their
containers and application volumes are removed after execution. Runner image upgrades
and Docker build caches are separate from per-run cleanup. Project Dockerfiles determine
application image size; use separate build/runtime stages to avoid retaining build tools
and caches in runtime layers. This repository's `e2e/Dockerfile` uses a separate build
stage and the existing runtime packager, keeping production server dependencies, built
UI and the editable Git fixture while excluding web development dependencies and the
build stage's package store.

Redpact does not prune unrelated Docker resources. Shared-local and remote services
are independently managed and are not stopped by Redpact; tests own their fixture
isolation. Normal shutdown awaits execution and cleanup. Abrupt termination may
leave resources until successful recovery.

## Manual Container

Project Container uses the live checkout of the configured main branch, including
uncommitted inputs; directory projects use their connected root. No substitute
checkout is chosen when the required checkout is missing. The fixed shared project configuration supplies the services and dependencies. One manual environment per project stays alive until
Stop, Restart or server shutdown. It has `lifecycle: "manual"` and no test run IDs;
it cannot be reused by test execution.

Compose build images for a manual Container use a stable project-specific Compose name,
so the latest tagged project image remains available between manual sessions. Temporary
test environments use separate owned build tags and remove those tags after execution;
Redpact preserves existing project image tags and unrelated Docker images. A manual
restart removes a superseded image only when no other tags or containers reference it.

Local edits show input changes but never hot-reload or restart the session. Restart
removes old owned resources before capturing current inputs; failed cleanup blocks
replacement. Stop remains available when source/settings are unavailable. Reverting
inputs clears freshness differences. Unknown inputs show a diagnostic, not a false
up-to-date state. HTTP endpoints are checked for host reachability before Ready;
any HTTP response proves reachability, not application health.

## Compose and source capture

Compose defines images, commands, internal ports, networks, healthchecks and fixed
prerequisites. Redpact selects the service closure, applies dependency bindings,
adds ownership and dynamic host-loopback publication, and observes readiness.
Long-running services need healthchecks; completion jobs use the appropriate
`service_completed_successfully` dependency. Validate before provisioning.

The supported managed subset rejects host network/PID/IPC, privileged devices,
fixed container names or host ports, external resources, host bind mounts, `env_file`,
file secrets/configs, includes/extends, hooks and remote build inputs. Multiple
explicit Compose files are supported; there is no profile selection field. Use a
local Unix Docker socket and Compose supporting `!override` (v2.24.4+).

Compose capture follows selected local build contexts and their Docker ignore rules,
including Dockerfile-specific precedence. Image-only services do not scan source.
Paths, contents, modes and link text contribute to identity; symlinks are not traversed.
Unit excludes host dependency directories, including `node_modules`, `.pnpm-store`,
`.venv` and `venv`, before Docker build; links inside excluded directories are not
followed or copied. Input capture has no fixed
file-count/total-byte ceiling; submitted-test limits are separate. Concurrent file
edits, external downloads and mutable image tags are not a complete immutable
application snapshot. Queued/input changes can invalidate preparation.

The pinned Testcontainers patch prevents failed-start automatic cleanup from skipping
Redpact's final logs and ordered removal. Re-evaluate it when upgrading the library.

## Runner connectivity

Each execution creates a labelled runner network. Integration and Playwright join that
network in their own network namespaces. Managed services have `<service>.redpact.test`
DNS aliases; browser baseURL uses the configured scheme and port with that hostname.
Applications must accept that origin and configure their own CORS, cookies and TLS
accordingly. Redpact does not disable certificate checks or browser security, rewrite
remote origins, or treat a successful host request as runner reachability.

Declare shared-host URLs explicitly with `host.docker.internal`. The runner supplies a
host-gateway mapping. Docker Desktop loopback access is tested from actual runners;
Linux host-gateway access does not make a loopback-only listener reachable. Configure
a reachable host listener or an explicit project-owned forwarding service and verify
from the consuming runner. Never replace a runner URL with `localhost` blindly.
Remote services keep their real URLs and authentication. Shared-local and remote data
are not isolated by per-run Docker networks; fixtures must use independent data.

## Playwright evidence

Targets declare maintenance `scope: "worktree" | "project"` and
`purpose: "capture" | "functional"`. A target executes the selected checkout once;
old Before/After baseline descriptions are not the current execution model.
Capture is visual evidence; functional assertions establish tested behavior.

Playwright lists current worktree capture drafts and changed project capture files
even before execution or when no PNG was recorded. Source presence keeps the tab,
file selection and execution action available. Desktop/Mobile filters recorded
images, not the source list. Images come from the latest matching execution for the
selected size; no image in that execution means no substitution of an older image.
Recorded CSS viewport width classifies each PNG at 768px; missing provenance stays
visible in both modes with an explicit label. Image pixels, filenames and current
run defaults do not establish viewport provenance. Project Captures lists declared
capture sources before execution and separates each file's Test Code from its Screenshots;
an empty Screenshots tab does not hide executable capture code. Project Tests retains
Captures, Tests and Runs independently of changed-file review.

Secret-bearing runs omit trace archives. Images, videos and submitted source are not
credential-scanned. Known secret redaction in text is not a hostile-code sandbox.

## Limits and verdicts

Instance defaults are `environmentConcurrency: 2`, `testResources.memoryMiB: 2048`
and `testResources.timeoutSeconds: 600`. Allowed ranges are 1–4 concurrent managed
environments, 64–1048576 MiB and 1–86400 seconds. New operations capture new settings.
Per-test/hook timeouts remain separate.

Unit, Integration and Playwright use Docker memory/swap limits and an external wall-clock
timer. Integration also bounds the V8 heap. Its submitted package installation executes
inside the runner and consumes the same execution budget. Limit violations are execution
errors, not assertions or cancellation. Application/dependency containers, image builds
and direct shell tests are outside this runner budget.

Distinguish passed/failed assertions from collection, configuration, environment,
execution, cancellation, interruption and unknown outcomes. Parsing a test is not
running it. Missing reports after termination do not imply success. Finished runs
can still require cleanup.

## Portable fixtures

`REDPACT_CONNECTIONS_FILE` points to a private per-run JSON file with `version: 1`
and `services.<name>.ports.<containerPort>: { host, port }`. Hosts are
`<service>.redpact.test` aliases and ports are internal container ports. Services without
published ports have empty maps. No credentials or container variables are included.
Project fixtures create their own HTTP/DB clients and clean them up; no Redpact SDK
or runtime API calls are needed. Both runners receive the same explicit `tests.env` bindings.

For extra drivers, submit the supported root package manifest and frozen pnpm lockfile
with helpers. The [Order Desk provider](../examples/order-desk/tests/connections.js)
and [fixtures](../examples/order-desk/tests/fixtures.js) demonstrate portable clients.
Outside Redpact the example accepts `TEST_CONNECTIONS_FILE`; this does not introduce
a host application fallback inside Redpact.

Implementation: [execution workflow](../app/server/src/workflows/execute-tests.ts),
[stop workflow](../app/server/src/workflows/stop-environment.ts),
[Unit workflow](../app/server/src/workflows/unit-tests.ts),
[Playwright record workflow](../app/server/src/workflows/playwright.ts),
[resource schema](../app/server/src/core/test-resource-schema.ts).
