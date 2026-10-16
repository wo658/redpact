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
| `run_tests` | Absolute `path`, optional exact `tests` paths; submits and executes Integration |
| `get_run` | Returned execution or review `id`; reads state, results and environment cleanup |
| `run_unit_tests` | Absolute existing checkout `path`; runs the complete configured Unit command |
| `run_playwright` | Absolute existing checkout `path`, required declared `target`, optional `viewport` |
| `list_executions` | Absolute checkout `path`, optional returned `before` cursor; retained history across all three execution types |
| `get_execution` | `kind` and `id`; `detail` selects result, bounded log, captured test source or recorded PNG |
| `cancel_execution` | `kind` and `id`; cancels the identified execution through its existing lifecycle |

Execution derives from the shared fixed project settings; `selection` is rejected.
Configure does not save configuration, start containers or approve tests.
Call describe, edit authored files with the host agent, then validate the same checkout.
The host agent owns file editing and native Git operations. These tools do not create
Git worktrees, accept arbitrary shell commands or expose independent container management.
Execution workflows prepare and clean up their own temporary environments.

Use `list_executions` to find evidence for the same checkout, then `get_execution`
with `kind: integration | unit | playwright` and its ID. Unobserved checkouts return
empty history without registering a project. `detail: source` requires `sourcePath`
and reads recorded Integration or Playwright test code, never the current file.
Unit retains whole-command output instead. `detail: image` requires a Playwright
`artifactId` and accepts `side: before | after` (default `after`); it returns PNG
image content up to 8 MiB. Use the viewer for larger images, video and traces.
Passing historical evidence does not establish current-code freshness or human acceptance.

All three execution tools capture the instance approval policy when requested. Auto
starts through the existing execution workflow. Ask returns an `awaiting_approval`
review ID and an MCP App card without running project code. Integration retains its
environment-then-tests approval; Unit and Playwright each approve one captured request.
Models cannot grant approval or change policy. `get_execution` result accepts review
IDs and refreshes Unit/Playwright cards. Pending reviews have no logs, source or images
from an execution. After admission, Unit/Playwright review IDs resolve their recorded
execution for evidence; Integration logs/source use the eventual run ID.

`cancel_execution` accepts pending review IDs of all three kinds without approving them.
Read result state after cancellation to distinguish test outcome from cleanup failure;
Unit and Playwright retain their existing cleanup retry behavior.

The configured startup default or an existing `worktreeId` can resolve a binding;
prefer an explicit path when authoring. Discovery observes declared roots and native
Git registrations without creating worktrees or running tests. Collection errors
remain diagnostics. [Execution](execution.md) describes runtime boundaries.

The full app retains project connection and management, settings editors, directory and file browsing, Git navigation/actions, manual Container controls and host-plugin update APIs. MCP tools retain their narrower execution/configuration-inspection scope; restoring app controls does not expose Git mutations, settings writes or approval capabilities to the model. See [navigation](ux-navigation.md), [settings ownership](settings-reference.md) and [Git operations](git.md).

## Request approval and Apps

The bundled resources are `ui://redpact/environment.html` and
`ui://redpact/tests.html`. They present response snapshots; they do not continuously
poll or subscribe. The Environment card lists each dependency’s fixed kind once,
without execution-time dependency choices. `get_run` refreshes an Integration snapshot;
`get_execution` refreshes Unit/Playwright reviews. The connected viewer presents
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
up to 20 failures/evidence references with counts; use `get_execution` for the retained
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
approval and cancellation use `/api/execution-reviews/:kind/:id/approve` and `/cancel`;
approval checks the expected revision and the appropriate Integration subject.
They keep the existing same-origin/local-host boundary. Model-facing tools never
expose the viewer's approval operation. See [navigation](frontend.md).

The worktree's `scope=evidence` event subscription includes Integration and
Unit/Playwright review records, retained execution evidence and shared project settings.
Chat-created requests and approval or cancellation changes refresh the connected
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

## Current test catalog and source

`GET /api/worktrees/:id/unit-tests` and `/integration-tests` return metadata-only
catalog entries (`path`), preserving `scope=all|changed` with `changed` as the default.
Use the corresponding `/unit-tests/source?path=...` or
`/integration-tests/source?path=...` endpoint for one selected current source.
The decoded path must belong to the configured, Git-visible test catalog. Invalid
selection returns 400; a file preview failure returns `{ path, source: null, issue }`.
Successful reads return `{ path, source }`. These reads never execute tests or alter
recorded sources. See [file browsing](frontend.md) for preview limits and navigation.
