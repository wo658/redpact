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
recorded code and screenshots remain in project Runs and Log.

## Review scope follows source files

Worktree UI Review includes current worktree drafts and project scenario files added,
modified or renamed since the configured main-branch merge base. Committed, staged,
unstaged and untracked changes count. Deleted sources and unchanged maintained files
are excluded. All recorded cases and images in a matching file/target are included;
this is not per-case change detection, pixel comparison or application dependency
impact analysis. Application-only edits do not select unchanged maintained scenarios.
For task-specific evidence of those edits, author a meaningful worktree draft rather
than changing maintained code solely to make it appear in review.

Inspect `GET /api/worktrees/:id/playwright/catalog` for included files, the comparison
revision and diagnostics. If comparison is unavailable, the catalog includes drafts
only with a diagnostic; never describe that as complete changed-project coverage.
Project Screenshots and Tests retain full maintained scope. Unfiltered execution
history, recorded sources and artifacts stay in Runs and Log after draft cleanup.
The review filter does not narrow execution: Run Playwright executes the entire
selected target. Verify full results through the run endpoint even when UI Review
shows only a subset. Active cancellation and cleanup remain available.

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

Resolve the actual worktree on the connected instance. For authorized execution,
POST /api/worktrees/:id/playwright/run with the target name (required when multiple targets exist). Optional viewport
overrides apply to this execution. Read
GET /api/playwright-runs/:id until terminal, inspect case/step evidence and distinct
cleanup errors. MCP run_tests remains Vitest integration execution and does not
accept Playwright files. Do not substitute direct Docker or Playwright CLI execution:
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

Cancel/retry cleanup through POST /api/playwright-runs/:id/cancel. Cancellation is
separate from test verdicts. Preserve recorded evidence and unrelated environments.
Report exactly which browser scenarios and rendered images were observed, source
identity and image/browser/viewport conditions. Linux web captures do not prove
native desktop-shell behavior. An unsupported installed server is a setup or
verification gap, not an excuse to manufacture run records or silently bypass gates.

Project Playwright separates Screenshots, Tests and Runs. Screenshots lists named
capture images and links their generation source. Tests lists maintained project functional
source files even before execution. Worktree results remain in worktree review and Runs. Runs retains executed source and diagnostic
attachments for both purposes. Functional failure screenshots do not enter the
Screenshots list. Project Screenshots excludes worktree runs; Runs preserves both scopes.



## Completion evidence

Wait for the selected target's terminal result, inspect cases/steps and cleanup status,
and verify the run in the intended worktree's list on the same instance. For capture,
apply the capture guide's artifact checks; for functional, inspect actual assertions.
Report exact source identity, viewport and capture limitations. A started run,
source catalog entry or attached image alone is not completed review evidence.
Trace may be omitted by the runtime for secret-bearing executions; report availability
rather than claiming every execution retained one.
