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
are distinct from the public Next.js documentation website.

HTTP and MCP enter the same application workflows and share execution/settings validation.
Read-only inspection does not execute code. Explicit mutation routes own their
normal preconditions even when called outside the viewer. See [architecture](architecture.md).

## Model-facing tools

| Tool | Contract |
| --- | --- |
| `get_workspace_status` | Absolute checkout `path`; read-only settings diagnostics, existing binding, pending approvals, active/recent executions and cleanup attention |
| `get_review_context` | Execution `kind` and `id`; bounded failures, recorded evidence references, captured approval preview and relative viewer review path |
| `configure` | `describe`, `inspect` or `validate` for an absolute execution `path`; returns schema, roots, diagnostics and optional plan |
| `run_tests` | Absolute `path`, `kind: integration / unit / playwright`; Integration accepts optional `tests`, Unit uses the complete command, Playwright requires `target` and accepts `viewport` |
| `get_run` | `kind`, `id`, optional `detail: result / log / source / image`; state, captured evidence and cleanup |
| `list_runs` | Absolute checkout `path`, optional `kind` and returned `before` cursor; up to 20 matching executions per page |
| `get_run_artifact` | Playwright `id`, `artifactId`, optional `side`; owned PNG, video or trace up to 8 MiB |
| `project_container` | Absolute observed project checkout `path`, `action: inspect / start / restart / stop`; selected worktree persistent manual environment lifecycle |

`run_tests` validates a strict discriminated union. Unit rejects file filters and arbitrary
commands; Playwright rejects arbitrary case selection. All kinds use the same workflows
as HTTP, fixed project settings and existing input capture. Configure never saves files,
starts resources or grants approval. Call describe, edit shared files, then validate.

For compatibility, omitting `kind` in `run_tests` means Integration. An id-only
`get_run` request (`{"id":"..."}`) preserves the existing full Integration run/review
response. Explicit `kind` selects the bounded result contract for all three kinds:
state, verdict, cleanup, captured `identity`, case count, up to 20 failures and 20
artifact metadata entries, full `failureCount`/`artifactCount`/`evidenceCount`, and
`truncated`. Messages and labels are capped at 2,048 characters. Raw case bodies,
stdout/stderr and settings source are not copied into the default result. Follow
`evidence`, artifact `retrieval`, or `reviewPath` for detail. Pending requests retain
their approval card and never imply admission. Migrate old
`run_unit_tests` / `run_playwright` calls to `run_tests` with the corresponding kind;
`get_execution` becomes `get_run`, and `list_executions` becomes `list_runs`.
The old tool names are no longer exposed.

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

`project_container` requires an observed connected project and uses the actual `path`
worktree for inspect/start/restart/stop. Inspection never starts anything. Shared settings
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

## Request approval and Apps

The bundled resources are `ui://redpact/environment.html` and
`ui://redpact/tests.html`. They present response snapshots; they do not continuously
poll or subscribe. The Environment card lists each dependency’s fixed kind once,
without execution-time dependency choices. `get_run` refreshes an Integration snapshot;
`get_run` refreshes Unit/Playwright reviews. The connected viewer presents
execution history, detailed evidence and recovery controls.

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

App-only `review_action`, `execution_review_action` and `set_approval_policy` are hidden
from models by compliant clients. Unguessable capabilities are delivered in UI-only
`_meta`, never model-visible content. Revision checks reject stale actions; duplicate
final approval returns the existing run. Changing the default policy affects future
requests, never pending approvals. A host without Apps can open the connected review
screen for an explicit approval; it cannot substitute textual approval or silently
change Ask to Auto. The viewer's explicit review actions use the same workflows and
retain the trusted-local HTTP boundary below.

The browser bundle uses the official Apps SDK; the server registers resources/tool
metadata with its existing SDK. Cards contain their assets and use the host bridge
rather than iframe HTTP. [Storage](storage.md) describes durable review recovery.

## Conversation context

`get_workspace_status` reads the named checkout without registering it or executing
code. It returns the shared settings root and diagnostics, existing observed binding,
pending approvals and bounded execution summaries. Active and unfinished cleanup
records are queried independently of the recent history page. It reports observed
facts and diagnostics; it does not prescribe commands or preapprove work.

`get_review_context` returns one execution or pending review with bounded failures,
evidence references and a relative `reviewPath`. Resolve it against the same viewer
origin; it contains no environment credentials or UI capabilities. Summaries return
up to 20 failures/evidence references with counts; use `get_run` for the retained
detail. Freshness remains `unknown` until the relevant live inputs are actually compared,
and human acceptance is `not_recorded`. Unit command failure is not automatically
classified as an assertion failure.

Integration approval previews show the captured application service selection,
dependency kinds and submitted test files with scenario titles. Service names are
limited to 50 with the full `serviceCount`; this preview uses the saved request,
not current settings, and appears before the viewer's environment approval action.

Playwright completion alone does not prove environment removal. Its card and review
summary report cleanup as `unknown` without explicit cleanup evidence, or `failed`
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

Default and desktop execution bind loopback. The server also validates loopback Host,
exact browser Origin and Fetch Metadata; cross-site/same-site requests are rejected.
No Bearer token is required. Trusted local processes can call HTTP and access files;
this is not isolation between users or against a malicious local process.

Container observation may explicitly launch with `--host 0.0.0.0` while publishing
only on host loopback. This does not introduce remote authentication or shared-user
access. Preserve admission checks when changing transport or preview wiring.

Implementation: [MCP registration](../app/server/src/interfaces/mcp/routes.ts),
[App metadata](../app/server/src/interfaces/mcp/apps.ts),
[HTTP documentation](../app/server/src/interfaces/http/docs/routes.ts),
[review workflow](../app/server/src/workflows/review-tests.ts).

Runtime update status and explicit check/install actions use `GET /api/updates`, `POST /api/updates/check` and `POST /api/updates/install`. Installation requires `{ version }` matching the discovered version and a recognized CLI supervisor; cached `canInstall`, `busy`, `error` and `installError` distinguish capability, work and failures. Reads never install. These HTTP routes retain the same-origin/local-host boundary and expose no arbitrary command or registry URL. See [runtime updates](installation.md).
