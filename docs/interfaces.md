---
title: HTTP and MCP interfaces
description: Shared services, request approval, credentials and local access.
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
| `configure` | `describe`, `inspect` or `validate` for an absolute execution `path`; returns schema, roots, diagnostics and optional plan |
| `run_tests` | Absolute `path`, optional exact `tests` paths and explicit or saved `selection`; submits and executes Integration |
| `get_run` | Returned execution or review `id`; reads state, results and environment cleanup |
| `request_keys` | Observed `projectId` and required declared credential `names`; requests direct user input and returns availability |

`selection` is allowed for inspect/validate, not describe. Configure does not read
saved selection automatically, save configuration, start containers or approve tests.
Call describe, edit the authored files, then validate the same checkout. Use the
viewer or HTTP for Unit and Playwright: Unit executes its configured command,
while Playwright selects a functional or capture target and retains its UI-review evidence.
MCP does not expose cancellation/cleanup;
users manage early termination and retry through the viewer.

The configured startup default or an existing `worktreeId` can resolve a binding;
prefer an explicit path when authoring. Discovery observes declared roots and native
Git registrations without creating worktrees or running tests. Collection errors
remain diagnostics. [Execution](execution.md) describes runtime boundaries.

## Request approval and Apps

The bundled resources are `ui://redpact/environment.html` and
`ui://redpact/tests.html`. They present response snapshots; they do not continuously
poll or subscribe. Another `get_run` supplies a fresh snapshot. The persistent local
viewer remains the place for execution history and resource controls.

A new `run_tests` captures the immutable submission and instance `approval` policy:

- `auto` admits execution immediately.
- `ask` returns an `awaiting_approval` review ID. Environment approval precedes test
  bundle approval. No container or test process starts until both are accepted.

Approval binds the captured submission, selection, revision and settings digest.
Admission and queued execution revalidate settings. Later file edits do not replace
captured tests. This does not freeze every application input, prove sufficient tests,
record a TDD red, or approve a Git merge.

App-only `review_action`, `set_approval_policy` and `submit_key` are hidden from models
by compliant clients. Unguessable capabilities are delivered in UI-only `_meta`.
Revision checks reject stale actions; duplicate final approval returns the existing
run. Changing the default policy affects future requests, never pending approvals.
A host without Apps cannot silently replace Ask with textual approval or Auto.

The browser bundle uses the official Apps SDK; the server registers resources/tool
metadata with its existing SDK. Cards contain their assets and use the host bridge
rather than iframe HTTP. [Storage](storage.md) describes durable review recovery.

## Credential inputs

Declare `{ "secret": "KEY_NAME" }`, then request only the missing names needed by
the selected connection. Users enter values in the card or Project Dependencies.
The agent receives availability, not values, and must not call `submit_key`, read
HTTP value endpoints or private secret storage.

Input capabilities are scoped to a project and declared names, expire after 30
minutes and at restart, and never authorize execution. Saving clears the card input.
Public secret availability and private editable values are separate endpoints.
Redaction covers known selected values in text, not arbitrary transformed output,
screenshots, video or authored source.

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
