# Managed integration acceptance

This is the default acceptance path for changed public application behavior, API,
persistence and service interactions. Identify observable outcomes and author the
relevant regression before implementation; observe functional red and then green.
Focused Unit tests can supplement complex rules but do not replace this evidence.
For frontend work, also use Playwright functional tests for the changed user flow.
Avoid redundant API scenarios when browser coverage already establishes the same
contract; retain independent Integration assertions for otherwise uncovered contracts.
Missing setup remains an explicit verification gap, never an automatic Unit fallback.

Managed Integration sources are project-owned and Git-tracked. Place them under
`tests.directory`, which defaults to the root `integration/` directory; `.redpact`
holds Redpact configuration and runtime data, not application test sources. Configure
a different project-relative directory only when the repository already has a clear
tracked convention. Unit patterns must not include the selected Integration directory.

Read before authoring or executing managed integration tests, reading their results,
or cancelling/removing their resources. Discover the connected tools and actual
HTTP contract. Use configure describe before authoring settings; read [Project dependencies](dependencies.md) when services or connections need
changes, and [configuration](../../redpact-init/references/configuration.md) only for setup repair. Unit IDs do not belong to these MCP operations.

## Test the public behavior

Exercise the actual app through its supported public HTTP/MCP or other application
boundary, using the requested dependencies. Do not replace this with internal Core
calls, a clone/example, or a container that merely reruns the unit suite. Follow the
target repository's self-E2E guide when present. Assert the relevant response and
observable consequence, including persistence/readback or failures when changed.
Use isolated fixture data and existing cleanup facilities; do not change unrelated
project/runtime state. Keep secrets out of source and captured diagnostics.

An environment or collection error requires setup diagnosis; it is not functional
red. For each claimed TDD cycle retain the actual failing assertion, then execute
unchanged intended assertions against the new application inputs to establish green.
A passing run from stale application inputs is not current verification.

## Author reviewable cases

Use the language of the user's task for acceptance scenarios and submitted test
semantics: describe/test/it titles, case-intent /** ... */ immediately before tests,
assertion-reason // comments immediately before assertions, and observed Step names.
Explain the business/behavior reason where useful instead of restating code. Preserve
identifiers, API names, paths, protocol values and original error evidence. A viewer
language change does not translate captured sources. These comments support static
review; they do not substitute for assertions or Steps.

## Execute and inspect

Apply this section only when managed integration evidence is selected. Native unit commands do not require this helper. Every runnable test submitted through run_tests must record named Steps for its meaningful actions and assertions. This requirement also applies to existing tests selected for a new run: add missing Step instrumentation before submitting them. Test titles, comments, console logs, and a single wrapper around an entire multi-action scenario do not replace meaningful Steps.

Reuse a compatible project helper or copy [Steps helper](../assets/steps.ts) into `tests.directory` as `steps.ts`. Keep that helper inside the captured test bundle; do not import it from the installed plugin or from outside the test directory. Initialize `createSteps(context)` inside each test. Await Steps sequentially, place the actual operation or assertion inside its callback, and allow failures to propagate. Do not nest Steps, run them concurrently, or record success before the callback completes. Keep shared hooks for fixtures; steps in a hook do not replace per-test Steps.

```ts
import { test, expect } from "vitest"
import { createSteps } from "./steps"

test("Application responds successfully", async (context) => {
  const step = createSteps(context)
  const response = await step("Request application health", () =>
    fetch(`${process.env.APP_URL}/api/health`),
  )
  await step("Verify the application is healthy", () => {
    expect(response.status).toBe(200)
  })
})
```

After execution, inspect `get_run` case results and confirm that tests which reached their bodies contain observed Steps and appropriate verdicts. If Steps are missing, repair instrumentation and rerun before claiming completion. An environment/collection failure or skipped test may have no observed Steps; report that limitation instead of fabricating steps or modifying historical results. An unfinished Step is not a pass.

Use `run_tests` with the absolute execution checkout and optional exact test paths relative to `tests.directory`. It captures the shared fixed settings and immutable submitted sources. Do not pass selections or read retired choice files. Each execution owns a fresh application environment and containerized Vitest runner; package installation also stays in the runner. The returned identity may be an execution or pending review, so inspect its state and honor review gates. Validation is not approval. Poll `get_run` through completion and cleanup, then verify the submission and run in the same worktree's connected viewer. Direct Docker/Compose or Vitest output is local diagnostics, not a recorded Redpact run.

For an executing request, read `get_run` until terminal evidence or the user's stopping point. Diagnose the reported failure class before choosing the next action. Preserve run IDs and actual outcomes across iterations; parsing a source file or successfully validating settings is not an executed test.

## Respect execution approval

Auto starts execution immediately. Ask returns `state: awaiting_approval`; its `id` identifies a pending review, not an executing run. Present the advertised MCP App and wait for the user's environment approval followed by approval of the captured test bundle. Do not repeatedly poll a pending approval or submit duplicate requests. `get_run` accepts the review ID or eventual execution ID; preserve `reviewId` when a run begins.

`review_action` and `set_approval_policy` are App-only controls, not agent commands. Never obtain private UI capabilities from runtime files, invoke those controls on the user's behalf, switch policy to unblock execution, or bypass the gate through HTTP. Changing the next-request policy does not approve an already pending request. If the client cannot render MCP Apps, Ask remains blocked until the user reviews through a capable host or cancels; textual presentation cannot replace approval.

Approval applies to the captured sources and fixed configuration. Later test edits require a new request to execute those edits. Configuration validation and successful card rendering are not approval or test evidence.

## Confirm the connected target

Before reporting a connected integration result, compare the returned run target with the requested absolute checkout. On the same connected instance, verify the submission appears in that worktree's submission list and its run appears in the submission's execution list using advertised read-only APIs. A passing run in a clone, example, or separate instance is not evidence attached to the requested worktree. Do not copy runtime records to repair a mismatch; execute against the intended target. Local test output alone does not create a submission.

## Automatic lifecycle and user controls

Redpact manages execution limits and removes temporary run environments automatically.
MCP has no cancellation or environment-stop tools. Do not issue substitute HTTP
cleanup requests. Report cleanup errors or requests for early termination and direct
users to the web UI. Shared local infrastructure remains outside test environments.
Preserve unrelated resources and execution history.

## Completion evidence

Keep the immutable submission/run IDs, terminal case verdicts and observed meaningful
Steps, and verify both lists on the requested checkout and connected instance.
Report setup, assertion, approval and cleanup outcomes separately. Authored cases,
validation or an awaiting-approval ID alone do not complete integration verification.
