---
title: HTTP and MCP interfaces
description: Shared services, request approval and local access.
---

# HTTP and MCP interfaces

## HTTP reference

The running server exposes `/openapi.json`, `/docs` (Swagger UI), `/swagger` and
`/redoc`. Hono route metadata and shared validators generate the API schema.
This generated reference is the field-level authority; do not duplicate all HTTP
schemas in Markdown. Assets are bundled locally. These API documentation routes
are distinct from the public Next.js documentation website. The pages explain that
no API token is required; documentation and API calls retain the local host and
same-origin access boundary described below.

HTTP and MCP enter the same application workflows and share execution/settings validation.
Read-only inspection does not execute code. Explicit mutation routes own their
normal preconditions even when called outside the viewer. See [architecture](architecture.md).

## Agent CLI

`redpact` is the agent interface for Redpact-owned state, settings, managed execution
and recorded evidence. It calls the running server's shared workflows over local HTTP;
it does not start another storage writer or execution engine per command. Model-facing MCP is limited to lifecycle and opening the app; operational tools remain App-only. General file browsing and Git
operations are excluded: use ordinary file tools and native `git`/`gh`.

Use `--server http://127.0.0.1:54321` or `REDPACT_SERVER_URL` for the connected
instance. With neither, the standalone default is `http://127.0.0.1:54318`.
The App Page instance commonly uses 54322. The CLI never searches other ports.
`--path` resolves relative to the current directory and defaults to that directory;
use an absolute checkout in automation. The GUI's selected project is irrelevant.
Read-only commands never connect a project implicitly. Record commands use the stored
`--kind` and `--id`, independently of the working directory.

| Commands | Purpose |
| --- | --- |
| `runtime status/start/stop`, existing `serve` | Inspect/start/stop the local runtime or run the foreground/supervised server |
| `projects list/connect/show/rename/disconnect/reconnect` | Manage Redpact project connections; mutations of records use `--project ID` |
| `workspace status --path PATH`, `workspace list --project ID` | Inspect checkout identity, diagnostics, approvals, executions and observed checkouts |
| `settings describe/get/patch/validate/repair --scope project\|instance` | Read and modify settings through the [revision-checked contract](settings-reference.md) |
| `dependencies inspect --path PATH` | Inspect the fixed dependency topology |
| `environment inspect/start/restart/stop --path PATH` | Manage the selected checkout's manual environment |
| `environments list --path PATH`, `show/stop --id ID` | Inspect recorded resources; stop only manual-owned resources |
| `tests list --kind KIND --path PATH`, `tests targets --path PATH` | Discover current tests and declared Playwright targets |
| `tests run --kind KIND --path PATH` | Submit captured inputs through approval-aware admission |
| `submissions list --path PATH`, `show/run --id ID` | Inspect or rerun retained Integration submissions |
| `runs list --path PATH`, `show/context/wait/logs/source/artifacts/artifact --kind KIND --id ID` | Inspect recorded results and evidence |
| `updates status/check/install --version VERSION` | Inspect, discover and explicitly install runtime updates |
| `plugins status/check/install --agent codex\|claude --version VERSION` | Inspect, discover and explicitly install agent plugin updates |
| `open`, `open --path PATH` or `open --kind KIND --id ID` | Open the full app, checkout history or the exact recorded review on the same instance |

Use `--help` on a command for its supported options. `--version` on update commands
is required only for `install`; `--agent` is required only for plugin installation.
`projects list --state connected|disconnected|all` defaults to connected. Catalog
`tests list --scope all|changed` applies only to Unit/Integration and retains the server's
catalog default; it does not select execution scope. `tests run --execution-scope
all|changed` overrides the shared execution default. `--kind` is `unit`, `integration`
or `playwright`. Integration alone accepts repeated `--test RELATIVE_PATH`. Playwright
requires `--target NAME` and optionally `--viewport WIDTHxHEIGHT`. For example, `1280x720` uses width 1280 and height 720; allowed widths are
320–3840 and heights 240–2160. Unsupported kind-specific options fail instead of being ignored.

`runs source` requires `--file CAPTURED_PATH`, never a current working-file path.
`runs logs` returns bounded output with truncation metadata. `runs artifacts` lists
metadata; `runs artifact --artifact ID --output FILE [--side before|after]` writes an
owned Playwright artifact to an explicit new file; existing files are never overwritten. `runs list`, `submissions list`
and `runs artifacts` accept a returned `--before` cursor. Keep the same target and
filters across pages. Existing server ownership and size limits still apply.

`--json` emits one versioned stdout document: `{ "version": 1, "ok": true, "data": ... }`
or `{ "version": 1, "ok": false, "error": { "code": ..., "message": ... } }`.
Errors may include structured details. No interactive prompt is required. Without
`--json`, successful results use the same envelope formatted for reading.

Submission without `--wait` returns accepted state and identity; exit zero does not
mean tests passed. `tests run`, `submissions run` and `runs wait` support
`--wait-timeout SECONDS` (default 600). Waiting ends on a terminal result, required
human approval or client deadline. A timeout or interrupted client does not cancel
server execution. An approval requirement returns immediately; open its review URL
and let the person act. The CLI cannot approve requests or change approval policy.

| Exit | Meaning |
| --- | --- |
| `0` | Requested operation succeeded, including accepted asynchronous submission |
| `1` | Transport or server operation failed |
| `2` | Invalid command/input, missing record or invalid configuration |
| `3` | Wait observed unsuccessful execution |
| `4` | Wait requires human approval |
| `5` | Client wait deadline reached |
| `6` | Revision or admission conflict |
| `7` | Wait observed cleanup failure requiring attention |

Cleanup failure takes precedence over execution failure; both remain in the result.
Reading a failed historical run with `runs show` succeeds as a read and exits zero.
No public test cancellation, test-environment force-stop or evidence deletion is added.

## Model-facing MCP and App-only transport

Runtime HTTP MCP exposes only `redpact_status`, `stop_redpact_server` and
`open_redpact` to models. `open_redpact` returns a viewer URL on that same instance
without executing tests. HTTP cannot start a stopped process because no server is
listening. The App Page companion provides `get_redpact_status`,
`start_redpact_runtime`, `stop_redpact_runtime` for its owned runtime, plus the existing
`open_redpact_app`. Model lifecycle tools neither require nor return App-only
capability tokens.

The App Page package registers only the companion's STDIO connection, including
while the runtime is stopped. Its model surface is exactly these four tools:

| Tool | Behavior |
| --- | --- |
| `get_redpact_status` | Return state, origin, message and session ownership without starting the runtime |
| `start_redpact_runtime` | Start the installed configured runtime; does not install packages or run tests |
| `stop_redpact_runtime` | Stop only the runtime owned by this plugin session |
| `open_redpact_app` | Open the full app or a recorded review with paired kind/id; does not start tests or approve requests |

Use the returned `origin` for CLI `--server`. Projects, settings, environments,
tests, evidence and updates use CLI. App-only tools remain available to the embedded
web UI, including installation and authenticated request/event bridging; they are
not additional model operations.

The seven operational tools below retain App-only visibility for full-app transport.
Agents use the CLI above instead of calling hidden tools. Raw `tools/list` responses
can include App-only tools; the host must filter them from model exposure using the
visibility metadata. Their presence does not authorize model invocation or acting
for a human approval.

| Tool | Contract |
| --- | --- |
| `get_workspace_status` | Absolute checkout `path`; read-only settings diagnostics, existing binding, pending approvals, active/recent executions and cleanup attention |
| `get_review_context` | Execution `kind` and `id`; bounded failures, recorded evidence references, captured approval preview and relative viewer review path |
| `configure` | `describe`, `inspect` or `validate` for an absolute execution `path`; returns schema, roots, diagnostics and optional plan |
| `run_tests` | Absolute `path`, `kind: integration / unit / playwright`; Integration accepts optional `tests`, Unit uses its command/file-command contract, Playwright requires `target` and accepts `viewport`; all accept optional `executionScope` |
| `get_run` | `kind`, `id`, optional `detail: result / log / source / image`; state, captured evidence and cleanup |
| `list_runs` | Absolute checkout `path`, optional `kind` and returned `before` cursor; up to 20 matching executions per page |
| `get_run_artifact` | Playwright `id`, `artifactId`, optional `side`; owned PNG, video or trace up to 8 MiB |

`run_tests` validates a strict discriminated union. Unit rejects arbitrary per-request commands; Playwright rejects arbitrary case selection. All kinds accept `executionScope: all | changed`, applying the shared [selection contract](execution.md). All kinds use the same workflows
as HTTP, fixed project settings and existing input capture. The retained MCP configure tool never saves files, starts resources or grants approval.
Agent settings access uses CLI describe/get/patch/validate instead of direct file edits.

For compatibility, omitting `kind` in `run_tests` means Integration. An id-only
`get_run` request (`{"id":"..."}`) preserves the existing full Integration run/review
response. Explicit `kind` selects the bounded result contract for all three kinds:
state, verdict, cleanup, captured `identity`, case count, up to 20 failures and 20
artifact metadata entries, full `failureCount`/`artifactCount`/`evidenceCount`, and
`truncated`. Messages and labels are capped at 2,048 characters. Raw case bodies,
stdout/stderr and settings source are not copied into the default result. Follow
`evidence`, artifact `retrieval`, or `reviewPath` for detail. Pending requests retain
their approval state and web review path and never imply admission. For App transport integrations, the former
`run_unit_tests` / `run_playwright` calls correspond to `run_tests` with the matching kind;
`get_execution` corresponds to `get_run`, and `list_executions` to `list_runs`.
The old tool names are no longer exposed. Agents use CLI commands, not these App-only tools.

```json
{"kind":"unit","path":"/absolute/checkout"}
{"kind":"integration","path":"/absolute/checkout","tests":["service.test.ts"]}
{"kind":"playwright","path":"/absolute/checkout","target":"functional"}
```

Use `list_runs` with the same checkout and kind filter for every cursor page.
Existing unobserved checkouts return empty history without registration; nonexistent paths remain input errors. `get_run` with
`detail: source` requires `sourcePath` and reads captured Integration/Playwright
source; Unit retains whole-command output. `detail: log` limits output to 65,536
characters and reports truncation. Existing execution-time secret masking remains.
`detail: image` accepts an owned Playwright PNG. `get_run_artifact` checks run and
side ownership before loading bytes; PNGs return images, video/trace return embedded
resources. Larger artifacts remain in the viewer. Evidence is not source freshness
or human acceptance.

All kinds preserve the captured approval policy. Auto starts the existing workflow;
Ask returns a review without running project code. Integration requires environment
then tests approval; Unit and Playwright approve one captured request. Models cannot
grant approval or change policy. Pending reviews have no execution evidence.
After admission, Unit/Playwright review IDs resolve their run for evidence;
Integration logs/source use the eventual run ID.

Tests have no public cancellation tool, HTTP cancel endpoint, Viewer cancel action,
or test-environment force-stop route. Timeouts, shutdown, failure recovery, retained
evidence and automatic cleanup remain internal lifecycle responsibilities. Historical
cancelled outcomes remain readable. Manual environment stop cannot cancel tests.

`redpact environment inspect/start/restart/stop --path PATH` requires an observed
connected project and uses the actual checkout. These CLI commands call the shared
HTTP manual-environment workflow; there is no `project_container` MCP tool.
Inspection never starts anything. Shared settings
and input checks apply; poll inspect for preparation state and failures. Manual action
admission is serialized per project, including omitted-main and explicit-worktree aliases. Stop targets only
that worktree's manual environment and waits for owned teardown before completion.
Manual environments survive server shutdown and reconnect on restart; they cannot supply
test execution resources. HTTP `/api/projects/:id/test-container` and its action/compose
routes accept optional `worktreeId`; omission retains the configured main-checkout default.
A worktree from another project is rejected. No arbitrary Docker command or unowned resource
deletion is exposed. Missing settings and unavailable checkouts remain diagnostics.

The full app retains project management, settings, browsing, Git and manual Container
controls. MCP does not expose Git mutation, settings writes or approval capabilities.
See [execution](execution.md), [settings ownership](settings-reference.md) and
[Git operations](git.md).

## Request approval in the web viewer

CLI execution requests and summaries return structured results with `reviewPath`;
App-only operational MCP responses use the same recorded review identities. Resolve
that path against the same connected viewer origin. Runtime MCP exposes no inline
chat cards, registered HTML App resources, approval tools or UI capabilities.
The sidebar App Page remains a separate full-app surface.

A new execution request captures the instance `approval` policy:

- `auto` admits execution immediately.
- `ask` returns an `awaiting_approval` review ID. Integration requires environment
  approval followed by test bundle approval. Unit presents its complete command,
  Dockerfile, directory and input identity. Playwright presents its declared target,
  purpose, viewport and application/test input identities. No container or test
  process starts until the required explicit approval.

Integration approval binds the captured submission, fixed execution plan, revision and
settings digest. Later file edits do not replace its captured tests. Unit and Playwright
approval binds the captured specification and settings/input digests. Admission rereads
the inputs and rejects changes instead of approving replacement inputs. Unit checks the
copied source before container build; Playwright checks captured tests and passes the
approved application identity through environment preparation. See [execution](execution.md)
for external input and fingerprint limits. Approval does not prove sufficient tests,
record a TDD red or establish human acceptance of code changes.

Humans approve requests in the connected web review screen. Revision checks reject
stale actions; duplicate final approval returns the existing run. Changing the default
policy affects future requests, never pending approvals. Models cannot approve through
MCP, substitute textual agreement or switch Ask to Auto to proceed. If the viewer is
unavailable, retain the pending request. Viewer actions use the same workflows and
trusted-local HTTP boundary below. [Storage](storage.md) describes durable review recovery.

## CLI conversation context

`redpact workspace status` reads the named checkout without registering it or executing
code. It returns the shared settings root and diagnostics, existing observed binding,
pending approvals and bounded execution summaries. Active and unfinished cleanup
records are queried independently of the recent history page. It reports observed
facts and diagnostics; it does not prescribe commands or preapprove work.

`redpact runs context` returns one execution or pending review with bounded failures,
evidence references and a relative `reviewPath`. Resolve it against the same viewer
origin; it contains no environment credentials or UI capabilities. Summaries return
up to 20 failures/evidence references with counts; use CLI `runs logs/source/artifact` and the viewer for retained detail. Freshness remains `unknown` until the relevant live inputs are actually compared,
and human acceptance is `not_recorded`. Unit command failure is not automatically
classified as an assertion failure.

Integration approval previews show the captured application service selection,
dependency kinds and submitted test files with scenario titles. Service names are
limited to 50 with the full `serviceCount`; this preview uses the saved request,
not current settings, and appears before the viewer's environment approval action.

Playwright completion alone does not prove environment removal. Its review
summary reports cleanup as `unknown` without explicit cleanup evidence, or `failed`
when a cleanup error was recorded.

The exact-record viewer uses `GET /api/review-context?kind=...&id=...`;
`GET /api/workspace-status?path=...` is a read-only checkout observation API. Explicit viewer
approval uses `/api/execution-reviews/:kind/:id/approve`;
approval checks the expected revision and the appropriate Integration subject.
They keep the existing same-origin/local-host boundary. Model-facing tools never
expose the viewer's approval operation. See [navigation](frontend.md).

The worktree's `scope=evidence` event subscription includes Integration and
Unit/Playwright review records, retained execution evidence and shared project settings.
Chat-created requests and approval changes refresh the connected
review screen without receiving other worktrees' records. This scope requires an
explicit worktree ID; retained evidence remains observable if its checkout is unavailable.

## Local access boundary

Default execution binds loopback. The server also validates loopback Host,
exact browser Origin and Fetch Metadata; cross-site/same-site requests are rejected.
No Bearer token is required. Trusted local processes can call HTTP and access files;
this is not isolation between users or against a malicious local process.

Container observation may explicitly launch with `--host 0.0.0.0` while publishing
only on host loopback. This does not introduce remote authentication or shared-user
access. Preserve admission checks when changing transport or preview wiring.

Implementation: [MCP registration](../app/server/src/interfaces/mcp/routes.ts),
[Review results](../app/server/src/interfaces/mcp/review-result.ts),
[HTTP documentation](../app/server/src/interfaces/http/docs/routes.ts),
[review workflow](../app/server/src/workflows/review-tests.ts).

Runtime update status and explicit check/install actions use `GET /api/updates`, `POST /api/updates/check` and `POST /api/updates/install`. Installation requires `{ version }` matching the discovered version and a recognized CLI supervisor; cached `canInstall`, `busy`, `error` and `installError` distinguish capability, work and failures. Reads never install. These HTTP routes retain the same-origin/local-host boundary and expose no arbitrary command or registry URL. See [runtime updates](installation.md).

## Current test catalog and source

`GET /api/worktrees/:id/unit-tests` and `/integration-tests` return metadata-only
catalog entries (`path`), preserving `scope=all|changed` with `changed` as the default.
Use the corresponding `/unit-tests/source?path=...` or
`/integration-tests/source?path=...` endpoint for one selected current source.
The decoded path must belong to the configured, Git-visible test catalog. Invalid
selection returns 400; a file preview failure returns `{ path, source: null, issue }`.
Successful reads return `{ path, source }`. These reads never execute tests or alter
recorded sources. See [file browsing](frontend.md) for preview limits and navigation.
