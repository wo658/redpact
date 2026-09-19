---
title: Results and screenshots
description: Inspect execution evidence, current and historical captures, logs and cleanup outcomes.
---

# Results and screenshots

Select the project and worktree you asked Redpact to execute. Check the execution identity and recorded time before interpreting results. Current files can change after a run; saved results describe the inputs accepted for that execution.

If you have no evidence yet, follow [your first run](first-run.md). For execution paths, see [writing and running tests](tests.md).

## Find the right view

| View | What to inspect |
|---|---|
| Project **Tests** | Current Unit and Integration files in the primary checkout, plus execution results |
| Worktree **Unit Test** | Matching changed sources and command results |
| Worktree Integration review | Submitted cases, recorded source and execution evidence |
| Worktree **Playwright** | Capture-purpose files with recorded PNG checkpoints for the selected Desktop/Mobile size |
| Project **Tests → Playwright → Screenshots** | Current named captures from project targets and recorded worktree targets |
| Project **Tests → Playwright → Tests** | Maintained functional files, including unexecuted sources |
| Project **Tests → Playwright → Runs** | Retained executions across worktrees and both scopes |
| Worktree **Log** | Unit, Integration and Playwright summaries with copyable diagnostics |

Opening a page or selecting source is read-only. Execution starts through an explicit run action. A file listed under Tests is not evidence that it passed.

Worktree **Playwright** lists capture-purpose files with PNG evidence in the latest matching execution for the selected Desktop/Mobile size. It follows worktree drafts and changed project capture sources; unchanged maintained sources belong in project Tests. Functional results belong in Tests and Log. Missing latest images do not fall back to older screenshots. Recorded capture viewport width determines the size filter; unknown provenance is labeled and visible in both modes. Confirmed-empty review tabs are hidden, while errors and active execution/cleanup remain reachable.

## Review changed test code

Worktree Unit and Integration **Code** panels show Git hunks using the same comparison as **Diff**, including additions, deletions, surrounding context and line numbers. There is no Changes/Full code switch. If the patch is unavailable, omitted, unmatched, or uses a different baseline from the file catalog, the panel shows **Changes unavailable.** without substituting the full source.

Project-wide test catalogs retain their full-source views. Recorded Integration execution sources remain immutable and separate from current worktree changes.

## Read test outcomes

For **Unit**, inspect the command, exit code, stdout/stderr and cleanup state. Results describe the whole command rather than individual cases. Selecting a source does not mean only that file ran. The source viewer reads current files, not an archived unit source snapshot.

For **Integration**, inspect captured source, case verdicts and observed steps. Confirm meaningful assertions were reached. A skipped case or failure before the test body may have no observed steps. An unfinished step is not a pass. Agents retrieve integration evidence through `get_run`.

For **Playwright**, inspect target, scope, purpose, scenario and step results, and attachments. Functional success means the executed assertions passed. Capture success means the scenario completed; the image still needs human inspection for visual judgments.

Keep these outcomes separate:

- **Assertion failure:** execution reached a check whose expected behavior did not match.
- **Setup or execution error:** collection, configuration, environment preparation or the runner failed; this does not establish a failing product assertion.
- **Cancellation or interruption:** execution did not finish normally; check which cases completed.
- **Resource limit:** execution exceeded a recorded memory or time limit; inspect the cause and applied limits.
- **Cleanup error:** resource removal failed; read this alongside the test verdict.

See [troubleshooting](troubleshooting.md) for next steps.

## Browse current screenshots

Open **Tests → Playwright → Screenshots** and select an image. Names such as `Settings / Appearance / Dark theme` appear under page and feature groups; the last segment labels the image.

The gallery uses the latest successful completed execution **per capture target**. Until a target succeeds, it falls back to that target's latest completed execution. A newer successful run replaces its entire name set, removing obsolete scenarios and renamed groups from the current list. Failed retries do not displace a successful set.

“Current” therefore describes a presentation policy, not a guarantee that every image reflects the latest files. Check its time and source. Different targets can show images from different executions. A source-changed indication means another run is needed before treating the image as evidence of today's code.

Worktree-scope captures enter this gallery with their recorded scenario source, even after their draft is cleaned up. Built-in diagnostic screenshots do not enter the gallery. Use Runs to find older or failed task captures.

## Open a historical capture

Choose **Tests → Playwright → Runs**, select an execution and open its screenshots or diagnostic attachments. Runs preserves original names, captured scenario sources, steps and results. It includes both scopes and evidence from removed checkouts.

Use Runs to find an image renamed, removed or replaced in the gallery. Follow its source link to read the captured scenario rather than assuming today's file generated it. Removing worktree draft code preserves these recorded sources and images.

Screenshots are static evidence, not a live preview. Fit and original-size controls change display scaling, not the captured viewport. New targets run the selected worktree once; the viewer does not provide automatic before/after comparison execution or visual approval.

## Inspect logs and share diagnostics

Open worktree **Log**. Rows show test kind, intent, status and creation time. Use **Older executions** to page through history and **Newest executions** to return. The copy action retrieves recorded diagnostic text for that execution.

Unit logs include bounded command output. Integration logs include retained run diagnostics. Playwright logs include recorded cases, steps and errors; they are not a complete raw browser-console transcript.

Include the execution ID, selected worktree, outcome and relevant error when asking an agent to investigate. Keep original failures across retries so a later pass can be tied to the intended correction. Resolve loading errors or stale-evidence notices before relying on the displayed status.

## Review one change from source to evidence

For a “save account settings” change, start with the intended behavior: saving a valid value should persist it and show confirmation. Then inspect the evidence in this order:

1. Open the relevant execution and verify the checkout and time.
2. Read its recorded Integration or Playwright scenario. Confirm it exercises the save action and checks the expected result.
3. Inspect the observed steps. Check whether the save, readback and assertions actually completed.
4. Open any named capture and judge the visible state. A success message alone may not establish persistence.
5. Compare the current source with what ran. If relevant code changed afterward, request another execution.

A useful conclusion is specific: “The recorded browser test submitted the form and observed the saved value after reload; the attached capture shows the confirmation state.” Avoid expanding that into a claim about every setting, device size or error path unless the evidence covers them.

## Why an older image can still be visible

Suppose a maintained capture target succeeds on Monday, then fails during Tuesday's retry. The current Screenshots gallery keeps Monday's successful set. Tuesday's failed attempt is still available in Runs. The gallery is useful for browsing complete scenes, while Runs answers what happened in that specific attempt.

If Wednesday's successful run renames a scene, the current gallery adopts Wednesday's full set for that target. Monday's old name remains in Monday's record. Use execution identity and recorded time when discussing a screenshot, especially after renaming or removing scenarios.

## Give the agent an actionable follow-up

Include the observed mismatch and the record that demonstrates it. For example:

> In this checkout's recorded Playwright run, the save step completed but the value reverted after reload. Inspect that run's source and failed assertion, fix the persistence behavior, and submit another execution with the same intended check. Report both execution IDs and the new cleanup status.

For a visual issue, name the capture and describe the visible problem. For a setup issue, include the preparation error. This gives the next investigation a clear starting point and preserves the connection between the original failure and its correction.

## Understand resource and source retention

Every execution owns temporary resources and cleans them up after completion, failure or cancellation. Manual preparation and environment reuse are not supported. A cleanup failure can leave resources behind. Retry Unit container cleanup in its execution details; use the environment controls for managed application resources. Use viewer cancellation and environment controls when needed; model-facing MCP tools do not provide cancellation or environment-stop operations.

**Clean up worktree code** removes recorded Playwright task drafts only after its checks pass. Historical evidence remains. Unit runtime input copies are removed during cleanup while command evidence remains. Integration submissions retain their captured test bundle.

Changing [configuration](configuration.md) or execution selection affects future requests; it does not rewrite results or reconfigure an existing environment. Return to the [documentation overview](index.md).
