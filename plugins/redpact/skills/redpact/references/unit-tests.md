# Unit and component tests

Unit tests support the acceptance paths selected from changed behavior in SKILL.md.
Do not route all logic, validation, state or component changes here by default.
Use Integration for public application behavior and Playwright functional tests for
frontend user flows; a component test alone does not complete browser verification.
Unit-only work needs a concrete isolated-logic rationale or an explicit user limit.

Read when the selected evidence includes native unit or component tests. Use the
runner and conventions already adopted by the target app; Redpact records commands,
not a replacement test framework.

## Choose the behavior boundary

Test observable rules, state transitions and interactions at the nearest useful
boundary. For UI behavior, render the actual component with its production providers
and exercise accessible controls. A source regex proving a component name exists is
not proof that navigation reaches it or an interaction works. Static checks remain
appropriate for intentionally static contracts such as a generated catalog.

Write the regression against the existing behavior before implementing it. A missing
module or failed collection is not red. If a new API needs a minimal compilable seam,
keep it behaviorless and explicitly identify that baseline; observe the intended
assertion fail before adding the behavior. Do not build the feature first and call
later tests TDD. Keep reviewed assertions; diagnose inaccurate fixtures separately.

Model browser and service doubles faithfully at their boundary: changing matchMedia
must update both matches and its event; remount tests must recreate the relevant
state; storage errors must really throw. Assert outcomes, not mocks agreeing with
their own implementation. Keep host globals and listeners isolated between tests.
Select edge cases from the changed contract, not a generic exhaustive checklist.

## Native red/green and connected evidence


Use the project's adopted runner, test locations, and meaningful assertions. Add
or extend the test closest to the changed rule. Execute it before implementation
and inspect the actual assertion failure; a nonzero process exit alone is not
functional red. Implement and run the same assertion to green, then required
regression checks. Do not add the integration Steps helper to native unit tests.

For connected review, inspect the existing primary `.redpact/settings.json` and
configure describe. Preserve or configure `unitTests.dockerfile`, `command`, `cwd`, and `patterns`
using the real project command and project-relative locations, then validate. Use
a finite command, not watch mode. Do not replace the shared whole-suite command
with a task-specific filter merely to speed up iteration. Unit execution requires a project-authored Dockerfile that installs dependencies
and copies source into /workspace. Commands run in fresh Testcontainers runtimes;
cwd is relative to /workspace. Host worktree dependencies are excluded, and unit
containers do not require Compose application services. Run focused native commands as needed and label their output local.

Keep Unit patterns separate from `tests.directory`: managed Integration sources default
to the Git-tracked root `integration/` directory, and validation rejects Unit patterns
that include it. Do not place project tests beneath `.redpact`.

Resolve the worktree on the same connected instance. The current HTTP operations
are `GET /api/worktrees/:id/unit-tests`,
`POST /api/worktrees/:id/unit-tests/run`, and `GET /api/unit-runs/:id`.
Run the configured whole command for connected evidence, inspect its terminal
output/status, and verify the returned ID in that worktree's recent unit runs.
Do not use a direct Docker or package command as a substitute for this connected
Unit run; retain it only as explicitly labelled local evidence.
When feasible use this path for both red and green; if red was only a focused local
run, preserve its command, cwd, failing assertion and output and say so explicitly.
Cancellation uses `POST /api/unit-runs/:id/cancel`. MCP run_tests/get_run
are managed integration operations and do not accept unit-run IDs. Never route
integration work through unit commands to bypass a pending approval gate.

The Unit Test source list includes added, modified and renamed matching files against
the configured Git comparison baseline, including untracked additions. Deleted sources
remain in Diff. Do not move or duplicate tests to populate the tab. File selection
never filters command execution; verify that the configured command covers the change.

Unit records capture command/cwd, bounded stdout/stderr, exit status and independent container cleanup status, not
immutable test sources or per-case verdicts. Report command success/failure and
the assertions actually visible in output separately. Do not call a unit command
record an integration submission or claim current source proves what a past run
executed. If connected recording is unavailable, retain local verification and
report the missing connected evidence rather than claiming registration succeeded.


## Check that the command covers the change

Compare command/cwd and discovery patterns with the actual changed package before
claiming coverage. A passing server command does not test a new web interaction;
a visible test file does not mean the configured command executes it. Preserve an
existing whole-suite command instead of replacing it with a narrow task filter.
Use an established aggregate command when appropriate and authorized, or retain the
shared command, run the relevant native command and report that coverage gap clearly.
Do not run an unrelated command merely to obtain a green evidence card. Configure
relevant source patterns without removing unrelated patterns when needed.

## Completion evidence

Retain the intended failing assertion and green result for each claimed TDD cycle,
required regression results, and connected whole-command terminal status when selected.
Verify its ID in the intended worktree's unit runs. Local-only red or green must be
identified as local; missing connected evidence remains a gap, not a completed run.
