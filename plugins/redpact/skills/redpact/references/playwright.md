# Playwright application review

Use by default for frontend behavior changes, with functional assertions against
the actual application. For user-visible UI changes, capture targets are also default
evidence retained for human review. Captures do not establish functional correctness
or visual approval by the agent. Read configure describe
and use the connected service's current shared settings schema. React story files,
storyboard catalogs and dedicated renderer connections are removed. Do not recreate
an isolated component gallery or copy production JSX to fabricate review evidence.

## Setup and authoring

Configure optional `playwright` in the primary `.redpact/settings.json`: directory,
application service, internal port and required named targets. Each target declares
`scope: "worktree" | "project"`, `purpose: "capture" | "functional"` and
directory-relative `testMatch` globs. Scope defaults to project when omitted.
Files must not belong to multiple targets. Viewport, locale, timezoneId,
colorScheme, video and timeoutMs are optional. The actual application and dependencies use the
fixed shared project configuration. Validate against the selected worktree. Missing
app container definitions belong to authorized setup; preserve access controls.

Author ordinary `@playwright/test` scenarios matching the declared target patterns
in the configured `playwright.directory`, using the structure below. Keep helpers within that folder. The managed runner supplies Playwright; no React renderer or project
Playwright config is evaluated. Do not assume additional npm packages are installed.

## Choose maintenance scope before purpose

Use the configured root, not a second directory under `.redpact`:

```text
<playwright.directory>/
  worktree/captures/       # This task's visual review
  worktree/tests/          # This task's behavior checks
  project/captures/        # Maintained capture scenarios
  project/tests/           # Maintained browser tests
```

Default new task-only review scenarios to worktree. Keep existing maintained tests in
project and repair them when behavior changes. Add durable regression coverage to
project/tests when future changes should continue to verify it. Do not interpret
capture/functional purpose as maintenance scope. Reuse helpers within the captured
root; maintained project code must not import worktree code.

Configure four non-overlapping targets with matching scope and purpose, for example
`worktree-captures: { scope: "worktree", purpose: "capture", testMatch: ["worktree/captures/**/*.ts"] }`.
Add `<playwright.directory>/worktree/` to the repository's ignore rules during setup.
Never force-add worktree sources, screenshots, videos or runtime logs to Git.
Moving a scenario into project is an explicit decision to maintain it, not an
automatic side effect of passing a test or merging a worktree.

Every execution retains an immutable copy of the scenario folder, including helpers,
plus its artifacts and source identity. At task completion, after final execution,
call `POST /api/worktrees/:id/playwright/cleanup-worktree`. The service refuses cleanup
when drafts differ from recorded sources or execution/resource cleanup is unfinished.
Do not bypass that refusal with shell deletion. Correct and record the final drafts
or leave them for the user. Cleanup never removes execution history; a deleted WT's
recorded code and screenshots remain in execution history.

## Recorded source and review

A chosen target executes the complete matching source set in the selected checkout.
Read its captured source, cases and images through `get_run` and open the exact
`get_review_context` path. Worktree-bound history retains previous attempts and
artifacts after draft cleanup. Current source visibility does not prove execution,
and an old passing run does not validate later application edits.

## Choose the purpose before authoring

Read [Capture review](playwright-capture.md) for human-reviewable UI evidence or
[Functional browser tests](playwright-functional.md) for behavior assertions.
Read both for user-visible UI behavior changes; use separate target files. A
visual-only UI change needs the capture guide, while a behavior-only change without
a rendered UI may need only the functional guide.
Capture checks prepare a reviewable state; they do not establish functional coverage.
Functional success does not require named PNGs in its own target.

Navigate to actual application routes and exercise real interactions with isolated
data. Use meaningful test.step operations and task-language scenario semantics.
Await application readiness and fonts for visual capture. Respect repository browser
restrictions; a preview tab alone is not authorization for inspection.
For app service, dependency or connection changes, read [Project dependencies](dependencies.md).

## Execute and inspect

Resolve the actual worktree on the connected instance. Prefer MCP `run_tests` (`kind: "playwright"`)
with the absolute checkout path and declared target, then `get_run` with
`kind: "playwright"`. Under Ask, present the request for human approval; do not
change policy or approve on the user’s behalf. Obtain its web review path using `get_review_context` and direct the user to the same
connected viewer for an explicit approval action, following
[Review and handoff](review-evidence.md). Optional viewport overrides apply to this
execution. Read
GET /api/playwright-runs/:id until terminal, inspect case/step evidence and distinct
cleanup errors. Use `run_tests` with `kind: "playwright"`; Integration file filters are not valid for this kind. Do not substitute direct Docker or Playwright CLI execution:
it creates no target record, UI Review artifacts or cleanup evidence. Never use an
unavailable endpoint as if it succeeded.

The service snapshots scenario sources and runs the selected target against only
the current worktree application. It collects artifacts before deleting temporary
execution resources. There is no baseline execution or comparison mode.

Verify the returned projectRoot/worktreeId and the run in
GET /api/worktrees/:id/playwright on the same instance. Open the worktree UI Review
for stored images, original-size inspection, source and trace links.
Viewing artifacts never starts an application. Respect repository restrictions on
additional interactive browser or screenshot inspection.

Public test cancellation and forced environment stop are unavailable. Automatic timeout, shutdown and recovery retain evidence and cleanup. Report cleanup failures with the run identity.
Report exactly which browser scenarios and rendered images were observed, source
identity and image/browser/viewport conditions. Linux web captures do not prove
native desktop-shell behavior. An unsupported installed server is a setup or
verification gap, not an excuse to manufacture run records or silently bypass gates.

## Completion evidence

Wait for the selected target's terminal result, inspect cases/steps and cleanup status,
and verify the run in the intended worktree's list on the same instance. For capture,
apply the capture guide's artifact checks; for functional, inspect actual assertions.
Report exact source identity, viewport and capture limitations. A started run,
source catalog entry or attached image alone is not completed review evidence.
Trace may be omitted by the runtime for executions with nonempty environment values; report availability
rather than claiming every execution retained one.
