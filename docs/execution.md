---
title: Execution and environments
description: Test runtimes, evidence, manual containers, limits and cleanup.
---

# Execution and environments

## Runtime ownership

| Entry | Runtime and inputs | Result |
| --- | --- | --- |
| Unit | Project Dockerfile and configured command or exact file command in a temporary container | Command status, exit code, stdout/stderr and cleanup status |
| Integration | Containerized Vitest against a fresh Testcontainers Compose application environment | Immutable submitted source, cases, steps and run/environment records |
| Playwright | Containerized browser against a temporary application environment | Functional results or capture evidence, optional video/trace |
| Container | Explicitly started manual project application environment | Inspection endpoints and lifecycle state; not test evidence |

Unit has no host-command fallback. Its Dockerfile must copy sources and dependencies
into `/workspace`, provide `/bin/sh`, and install during build. `cwd` selects the
command directory. Dockerfile ENTRYPOINT/CMD do not supply Redpact's supervisor.
The selected source file in the viewer does not filter the configured command; execution scope uses the explicit contract below. Results do not
invent per-case verdicts from an exit code.

Integration collects current checkout sources from Project Tests and worktree review. `redpact tests run --kind integration`
collects fresh sources for the supplied path. Submission identity and current file
contents must remain distinguishable in the viewer. [Test authoring](tests.md)
describes supported source collection and assertions.

The three entries are separate execution contracts. `redpact tests run --kind integration` admits only
Integration submissions. Unit runs start from the Unit tab or `redpact tests run --kind unit` and execute the complete
configured command; their exit status is not an Integration case result. Playwright
runs start by selecting a declared functional or capture target in the Playwright
UI/API or `redpact tests run --kind playwright`. Their screenshots, UI-review artifacts, execution record and cleanup stay
with that Playwright run rather than an Integration submission. See [MCP interfaces](interfaces.md)
for approval limits, recorded evidence lookup and public lifecycle boundaries.

The viewer presents a common progress strip for all three run types in their
result views. It shows the current preparation, execution, cleanup or finished
stage and elapsed time; an active Unit or Integration run also appears beside its
Run control. Unit distinguishes source capture, Docker connection, container
build and command execution. Integration distinguishes queueing, environment
preparation and test execution. Playwright distinguishes application preparation,
browser startup and browser execution. These labels come from the durable facts
already recorded on each run, so they can skip a short stage between refreshes.
They are not individual timed events or a stream of live command output. Errors
and cleanup results remain on the selected run.

For agent-mediated verification, direct Docker/Compose, Vitest or Playwright CLI
commands are local diagnostics, not Redpact execution evidence. Start each selected
path through its entry above so the connected worktree retains its result and cleanup.

## Approval and accepted inputs

MCP execution under Ask creates a durable review before starting project code. Unit
records the command/file-command specification, execution selection and a digest of the inputs its container will
copy. Playwright records the target, purpose, effective viewport, settings digest,
application fingerprint and test-directory digest. Requests retain their captured policy
when future defaults change. The same reviewed request can be approved in the chat
App or connected review screen; see [request approval](interfaces.md).

Approval revalidates the recorded specification and digests. Changed settings or sources
require a new request. Unit verifies the actual copied inputs before connecting to Docker
or building the image. Playwright verifies the captured test directory at admission and
the approved application fingerprint before recording its environment; the adapter checks
its copied inputs again before provisioning. A failure is recorded without silently
substituting newer inputs. A pending review is not an executed test, a recorded TDD red,
or human acceptance of the implementation.

Fingerprints cover the inputs described below, not every possible external effect.
Mutable image tags, external build contexts, host mounts, file-backed resources and
remote services retain their existing Compose boundaries. Approval does not turn those
inputs into immutable snapshots or prove runtime readiness.


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

Every Compose build uses a dedicated environment-UUID image tag, including builds
with an authored `image`. Generated configuration clears `build.tags` so execution
cannot overwrite authored or shared tags. Build images carry the instance ownership
label, retaining reusable final layers across environments; durable records identify
the environment's dedicated tags for cleanup. Other build options and pull policy
remain unchanged. Authored tags and external networks/volumes are not cleanup targets.
Named resources
are removed only when their labels identify this environment. Anonymous volumes are
removed with their owned container. Cleanup never treats a mounted volume as owned
merely because an application uses it, and does not re-evaluate Compose expressions.
Unit build images carry owner/run labels so cleanup also finds them when container
startup fails before an image ID is recorded.

The shared Playwright runner installs only Chromium and its system dependencies; Firefox
and WebKit are not included. The self-E2E application uses a Node slim runtime without
browsers. Browser scenarios live in `ui-tests/project/tests` and execute in the separate
Playwright runner, including test-code diff and capture viewport checks.

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

The project Container screen defaults to the configured main checkout. `redpact environment`
uses its actual `path` worktree; HTTP Container routes accept `worktreeId` to select one.
Directory projects use their connected root. All targets use the fixed shared settings.
Each worktree can own one manual environment, independent of test environments.
It stays alive across tests, idle periods, agent completion and Redpact shutdown until
explicit Stop or Restart. On server restart, ownership and observed Docker health are
reconnected without recreating services or treating this as new test evidence.
Interrupted preparations remain failed; interrupted stops retain cleanup ownership for retry.
Docker unavailability is distinct from an explicit successful stop.

Stop removes all owned containers, anonymous and dedicated named volumes, networks,
environment build tags, source snapshots and generated runtime files. Preparation and
service logs and historical environment records remain. Dedicated names use the environment
UUID; authored nonexternal network/volume names and build image tags cannot collide with another
worktree or overwrite an existing project tag. External volumes/networks, bind mounts,
pulled base images and unrelated tags remain outside environment ownership.

BuildKit's content-addressed internal cache and shared image layers remain shared Docker
resources. Redpact does not prune them or promise that removing a tag frees every byte of
its reported image size. Builds use an instance ownership label rather than a fresh
per-environment image label so identical final layers remain reusable. Generated Compose
files stay outside build contexts. A newly changed source can add shared cache; dedicated
images/tags and runtime files are still removed. Explicit cache exports declared by the
project remain project-managed shared resources. Cleanup failure is not stopped: retained
ownership and diagnostics allow an explicit retry, and restart waits for successful teardown.

Local edits show input changes but never hot-reload or restart the session. Restart
removes old owned resources before capturing current inputs; failed cleanup blocks
replacement. Stop remains available when source/settings are unavailable. Reverting
inputs clears freshness differences. Unknown inputs show a diagnostic, not a false
up-to-date state. HTTP endpoints are checked for host reachability before Ready;
any HTTP response proves reachability, not application health.

## Compose and source capture

Compose is the application execution definition. Redpact applies the configured
service selection and explicit dependency environment bindings, records ownership,
and adds runner connectivity where the service's network mode permits it. It does
not impose a managed Compose subset: host mounts, privileges,
custom container names, external resources, `env_file`, configs/secrets and advanced
build options are not rejected as Redpact policy. Published ports use automatic host
allocation except explicit main-manual dependency `hostPorts`; see [configuration](configuration.md).
Build image tags and nonexternal network/volume names are environment-owned. Custom container names
and other authored host resources can still conflict; native errors are retained.

Compose/Testcontainers handle native configuration, build, startup and wait errors.
A healthcheck is optional. When present, its reported health is observed; otherwise
a running service is accepted. Redpact does not add a host HTTP reachability gate;
actual HTTP/DB behavior is established by test assertions. Completion jobs use `service_completed_successfully`.
The Redpact settings schema, conflicting dependency bindings, input identity,
cancellation and cleanup ownership checks remain separate from Compose policy.

The patched Testcontainers Compose config API resolves merged inputs and paths for capture,
not an additional policy validator. It bounds command duration/output, accepts cancellation,
and invokes native `docker compose config` with the supplied minimal environment. Resolved service definitions preserve Compose options before
Testcontainers starts the selected services. The server passes its minimal process
environment and explicitly supplied bindings, not arbitrary server credentials.
Project `.env` and `env_file` are interpreted by Compose. Use a local Unix Docker
socket and a Compose version supporting the constructs your project declares.

Capture copies selected project-local build contexts with Docker ignore precedence.
External, remote and linked build inputs remain at their authored locations and are
handled by Compose/BuildKit; Redpact does not read or copy their contents. Host mounts
and file-backed resources also remain external runtime inputs. These inputs are not
an immutable captured application snapshot. Image-only services do not scan source.
Paths, contents, modes and link text of captured files contribute to identity.
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
an empty Screenshots tab does not hide executable capture code. Each selected file shows
a horizontal strip of named thumbnails above the large image. Click a thumbnail or use
the radio group's arrow keys to select a checkpoint without opening a dropdown. The
strip scrolls on narrow screens. The selected image fills the mobile content width and
scrolls vertically instead of shrinking into the remaining height; its run link remains
available below the image. Project Tests retains
Captures, Tests and Runs independently of changed-file review.

Runs with nonempty environment values omit trace archives. Images, videos and submitted source are not
credential-scanned. Literal environment-value redaction in text is not a hostile-code sandbox.

## Limits and verdicts

Instance defaults are `environmentConcurrency: 2`, `testResources.memoryMiB: 2048`
and `testResources.timeoutSeconds: 600`. Allowed ranges are 1–4 concurrent managed
environments, 64–1048576 MiB and 1–86400 seconds. New operations capture new settings.
Per-test/hook timeouts remain separate; [runner declarations](configuration.md)
defines their default and allowed range. For example, `tests.timeoutMs: 180000`
allows a test to run for three minutes, but a shorter instance budget still stops
the runner first. Explicit Vitest test/hook timeouts override the default.

Integration test/hook timeout errors retain Vitest's original message and add the
effective limit, elapsed case duration, test/hook stage and last interrupted named
Step when present. Module and nested suite-hook failures report elapsed module duration and remain
execution errors even when their tests were skipped or passed. These are
execution errors, not assertion failures. Runner wall-clock limits instead retain
resource-limit evidence and stdout/stderr; preparation limits are separate.

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

## Testcontainers delegation

The pinned `testcontainers@12.1.0` and its checked-in patch own Docker operations:
Compose config/build/start, image build/pull/inspection/selective removal, container
and network discovery, volume inspection/removal, logs, exec, resource updates,
OOM events, archives and ordered stop/removal. Production adapters do not invoke
Docker CLI or Dockerode directly. The runtime client resolves existing IDs after
worker exit or restart and supplies the selected local socket and daemon identity.

The patch extends existing library clients where the pinned release lacks APIs.
It propagates build-stream failures even when an earlier image tag exists, returns
an inspected image ID after building, and honors `autoCleanup: false` inside failed
container waits. Finite log snapshots propagate retrieval errors and handle TTY and
multiplexed stdout/stderr. Exec supports cancellation and bounded output; the runtime
retains responsibility for stopping the container and recording limits and verdicts.
Compose config is bounded to 30 seconds and 4 MiB by default.

Integration and Playwright runner tags include the digest of their complete bundled
build inputs. Reuse requires a matching input label, and execution uses the inspected
image ID. Build errors never fall back to a previous tag. Unit images retain per-run
owner labels and enable BuildKit for authored Dockerfile features such as cache mounts.
Shared runner Dockerfiles use the library default builder. Build layer caching stays enabled; automatic image deletion is disabled
so Redpact applies the ownership and retention rules above. Mutable upstream images
and external downloads remain outside the immutable source guarantee.

Redpact owns approval, input/evidence identity, durable state, resource ownership,
retention and cleanup retries. Services with healthchecks wait for health; other
running services do not wait for published ports. This does not establish HTTP/DB
readiness, which belongs in test assertions. Failed startup preserves containers
until evidence collection and owned-resource cleanup. Archives are retrieved through
Testcontainers and extracted with host `tar`.

Reassess and test the patch when upgrading Testcontainers, including installed-package
bundling. These extensions are repository-maintained library changes, not claims that
unmodified upstream 12.1.0 provides these contracts.

### Network allocation and recovery

Integration and Playwright allocate one runner bridge in addition to Compose's
non-external application networks. A default Compose application therefore normally
uses two subnets per execution. Authored networks are preserved to retain their
IPAM, isolation and driver semantics. External networks are never owned merely
because a service joins them. Manual environments retain their networks until stopped.

Docker allocates subnets from its daemon address pools unless an authored network
specifies IPAM. A pool with prefix `/16` subdivided into `/24` networks has 256
subnets before existing allocations and routing conflicts are considered. Address
exhaustion alone does not identify a Testcontainers defect or prove a leak: inspect
retained environments, the daemon's `default-address-pools`, allocated subnet sizes,
and host/VPN routes separately. Overlapping authored subnets are a different error.
Preparation logs retain the daemon error and add guidance for these two cases.

Cleanup discovers resources by the exact instance owner and environment labels,
then rechecks those labels before removal. It does not require a current Compose
project label: an older resource can retain valid ownership with a missing or stale
Compose label. Such networks previously escaped discovery and could leave an
allocated subnet after cleanup reported success. Missing ownership is not permission
to delete a network. Containers are removed before networks; failed removal preserves
resource IDs and the daemon reason in `cleanup.log` and the environment error. The
record refreshes its remaining resources when the daemon is reachable, stays
`stop_failed`, and supports another Stop attempt. If inspection is unavailable,
previously known resources remain recorded rather than being declared absent.
Startup also checks previously stopped records with a known daemon identity for owned
leftovers. A manual record with retained resources becomes `stop_failed` and requires
explicit Stop; transient execution resources are cleaned up automatically using their
durable environment records. Records, submissions and logs remain after removal. Resources with no durable record
or verifiable ownership require explicit investigation and are never globally pruned.

Before changing daemon pools, retry cleanup for owned retained environments and
verify the resulting network list. Increasing pool capacity does not fix a cleanup
failure, and global network pruning can delete other projects' resources.

## Selecting all or changed tests

Execution selection is independent of catalog `scope` and Playwright maintenance
`scope`. `executionScope` overrides the [shared default](configuration.md). `all`
selects the current Integration test directory, Unit file patterns or the selected
Playwright target. A legacy Unit shell command without `fileCommand` discovers its
own files; its record explicitly leaves that file list unknown.

`changed` compares committed HEAD with the single merge-base of HEAD and the local
`tracking.mainBranch`. It unions committed changes, staged changes, unstaged changes
and nonignored untracked files. Index changes remain changes even when working
content was restored. Renames include old and new paths, but only existing catalog
test files execute; deleted tests do not execute. A missing main branch, unborn HEAD,
missing/ambiguous merge-base or Git read failure rejects changed execution. There is
no silent fallback when the comparison is unavailable.

Changed helper/fixture files under the runner's test directories select all files in
that runner/target. Unit patterns without a fixed directory prefix (such as
`foo*.test.ts`) treat the project root as the helper directory and conservatively
select all on non-test source changes. Other targets' declared test files do not count as helpers.
Git-visible `.redpact/settings.json`, package manifests/locks, `.gitignore`, TypeScript
configuration and Vitest/Vite/Playwright/Jest configuration at the project root and
runner directory also select all. Records retain requested `changed`, resolved `all`
and `supporting_inputs` rather than disguising this as a changed-only run.
Implementation-source edits outside those directories do not infer affected tests;
this is file selection, not dependency analysis. Choose `all` for a full regression.

Integration's explicit `tests` list combines with `all` and is recorded as `explicit`;
it conflicts with `changed`, including a shared changed default. Helpers remain in
the immutable submission. Playwright always selects inside one declared target and
keeps helpers in the captured source bundle. Unit uses the authored file-command
contract. Zero selected tests rejects admission with “No tests selected”, starts no
container and creates no passing execution.

New submissions, Unit/Playwright runs and approvals retain requested/resolved scope,
comparison revision, reason and selected files. Approval/result views display this
selection. Unit and Playwright revalidate selection as well as existing source/settings
fingerprints before admission; a changed base or selected file set requires a new
request. Integration retains its immutable submitted sources. Historical records have
unknown selection rather than an invented full-suite claim. Project and worktree
Integration Run controls collect the current checkout; explicitly rerunning a recorded
submission still uses that original bundle.
