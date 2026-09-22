---
title: Writing verification
description: Choose unit commands, integration scenarios, or browser tests and retain evidence for the right worktree.
---

# Writing verification

Start with [Review your first change](review-workflow.md) to decide which evidence you need. This page explains how to author that evidence with your agent. Choose a test based on the behavior you need to verify. Start with [your first run](first-run.md) if the project is not connected yet.

| Need | Test type | Execution entry point | Recorded result |
|---|---|---|---|
| Run an existing test command | Unit | Unit controls in the viewer | Command status, exit code and output |
| Verify a public API and dependencies | Integration | MCP `run_tests` or Integration controls | Captured Vitest sources, cases and observed steps |
| Verify browser interactions | Playwright, `purpose: "functional"` | Tests → Playwright or available Playwright controls | Scenario and step verdicts, diagnostic attachments |
| Show application states for review | Playwright, `purpose: "capture"` | Tests → Playwright or available Playwright controls | Named screenshots, sources and execution details |

A screenshot lets someone inspect appearance. Assertions establish the behavior a test actually checks. Keep both when a change needs functional verification and visual review.

## Connect an existing unit command

Add `unitTests` to the shared `.redpact/settings.json`. This fragment assumes a project-supplied `unit.Dockerfile` that installs dependencies and copies the application into `/workspace`:

```json
{
  "unitTests": {
    "dockerfile": "unit.Dockerfile",
    "cwd": "app/server",
    "command": "pnpm test",
    "patterns": ["app/server/test/*.test.ts"]
  }
}
```

Merge these fields into your configuration, preserving other settings. Paths resolve from the selected worktree. The Dockerfile must provide `/bin/sh`, the package manager and dependencies. Installation belongs in Dockerfile build steps because Redpact replaces the image's startup command. See [configuration](configuration.md).

Open the project's **Tests** page and choose **Unit** to target the primary checkout. For a feature worktree, use its Unit Test execution controls. **Run Tests** executes the configured command in full. Selecting a source file does not filter execution; `patterns` determines which source files the viewer lists. Use a finite command with watch mode disabled.

Each run gets a fresh container. It does not use host-installed dependencies or require Compose dependency selections. Redpact records the command outcome and bounded stdout/stderr; it does not infer individual test verdicts from text output.

## Write integration scenarios

Put managed integration tests and helpers below `tests.directory` (the Git-tracked root `integration/` directory by default). These tests run with Vitest and exercise the actual application's public boundary, such as HTTP. Keep Unit patterns outside this directory. Bind application URLs through [configuration](configuration.md), rather than hard-coding allocated ports.

For agent-authored scenarios, ask the Redpact agent to copy the bundled [`createSteps` helper](../plugins/redpact/skills/redpact/assets/steps.ts) into that directory as `steps.ts`. Keep it with the captured sources. This test assumes `APP_URL` is configured for an application with a `/api/health` endpoint; adapt both to your application:

```ts
import { expect, test } from "vitest"
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

Await each step in order. Put the operation or assertion inside its callback and let failures propagate. Use separate steps for meaningful actions and checks. Titles and comments explain intent; observed steps show what execution reached. Write submitted scenario titles and steps in the task's language. Changing viewer language does not translate recorded sources.

Ask the agent to call `run_tests` with the absolute working-checkout path, and optional exact test paths relative to `tests.directory`. Helpers stay in the collected bundle. `run_tests` handles integration; unit commands and Playwright sources use their own execution paths.

Read the returned state, then inspect execution through `get_run`. Preserve its identity and verify evidence belongs to the intended worktree on the connected instance. Running tests directly in a shell does not create a Redpact submission. The project Integration run action collects current sources into a fresh submission; recorded source remains separate from subsequent edits.

Use isolated fixture data. For a save operation, verify readback as well as the immediate response. For a regression, retain the actual failing assertion and rerun against updated application inputs. Collection errors and unavailable applications are setup failures, not proof that the intended assertion failed.

## Choose Playwright scope and purpose

Targets have two independent properties:

- **Scope** controls maintenance: `worktree` is task-specific code; `project` is maintained with the project. Omitted scope defaults to `project`.
- **Purpose** controls presentation: `capture` produces review scenes; `functional` verifies behavior.

Use this layout under the configured scenario root:

```text
ui-tests/
  worktree/
    captures/
    tests/
  project/
    captures/
    tests/
```

Add `ui-tests/worktree/` to Git ignore rules. Commit maintained scenarios and helpers. Keep helpers inside the scenario root, and do not make project scenarios depend on worktree drafts.

Configure four non-overlapping entries in `playwright.targets`:

```json
{
  "worktree-captures": { "scope": "worktree", "purpose": "capture", "testMatch": ["worktree/captures/**/*.ts"] },
  "worktree-tests": { "scope": "worktree", "purpose": "functional", "testMatch": ["worktree/tests/**/*.ts"] },
  "project-captures": { "scope": "project", "purpose": "capture", "testMatch": ["project/captures/**/*.ts"] },
  "project-tests": { "scope": "project", "purpose": "functional", "testMatch": ["project/tests/**/*.ts"] }
}
```

This is only the `targets` value. Configure the application service, port and scenario directory as described in [configuration](configuration.md). A file cannot match multiple targets. Each target runs the selected worktree once against its actual application.

## Author a browser scenario

Import `test` and `expect` from `@playwright/test`. Redpact supplies the browser runner and application base URL. Relative helpers and Node built-ins are available inside the captured scenario root. Arbitrary additional scenario dependencies and evaluation of a project Playwright configuration are not supported by this runner.

This capture example assumes a Settings route and heading:

```ts
import { expect, test } from "@playwright/test"

test("Settings page is ready for review", async ({ page }, info) => {
  await test.step("Open Settings", async () => {
    await page.goto("/settings")
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  })
  await page.evaluate(() => document.fonts.ready)
  await info.attach("Settings / General / Initial state", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
})
```

Use stable names in the form `Page / Group / Capture name`. The exact ` / ` separator creates groups. Choose useful states such as an empty form, validation error or saved result. Wait for application state and fonts instead of fixed sleeps. Capture the viewport or a meaningful section with enough context to judge the change.

For functional targets, use `test.step` and assertions on observable results: navigate, submit a form, then verify the resulting state and relevant persistence. Screenshots are optional diagnostics. Functional screenshots do not populate the project's capture gallery.

Open **Tests → Playwright → Run Tests** and select a worktree and target, or use worktree **Playwright** controls. The fixed project configuration supplies application and dependency services. The default viewport is 1920 × 1080; settings or run options can override it. Viewing a saved image never starts execution.

## Design assertions that answer the task

Write down the behavior before choosing assertions. “The request returned 200” can be useful, but a save feature usually also needs a readback check. A rejected request should check the rejection and, where observable, that no unwanted state change occurred.

| Change | Useful behavior to assert | Additional evidence when needed |
|---|---|---|
| Save a preference | Read the new value through the public API or after reload | Capture the saved state |
| Reject invalid input | Observe the intended error and unchanged stored data | Capture the validation message |
| Filter a list | Matching entries remain and known nonmatching entries disappear | Capture empty and populated results |
| Recover from dependency failure | Observe the application's defined error or retry behavior | Record the configured dependency kind |

Use fixture data with recognizable values so an unrelated default cannot accidentally satisfy the assertion. Keep tests independent of execution order. If a scenario creates data, clean up through the application's supported interface when appropriate, especially when connecting to shared external infrastructure.

A mock-based test verifies your application against the implemented substitute. If the task concerns the real provider's authentication or response contract, a mock result cannot answer that question. State which dependency boundary the scenario actually exercised.

## Turn a capture into a maintained scenario

Start a task-specific scene under `worktree/captures` when it exists only to review the current change. If it represents a state worth checking again, move the final source and required helpers into the maintained project layout, select the project target, and execute it there.

The new execution matters: moving the file does not convert an old worktree record into a project record or populate the maintained gallery. Verify the new target's scope, purpose and screenshot names. Keep functional assertions in a functional target when their continued verdict is part of the project's regression coverage.

## Ask for a complete test handoff

For Integration, a useful request is:

> Add a focused test for the reported behavior using the project's public API and captured helpers. Demonstrate the intended failing assertion before the fix, then submit a passing run from the actual working checkout. Keep the assertion's intent and report both run IDs, the configured dependency kinds, and any preparation or cleanup issues.

For user-visible UI work, the Redpact plugin defaults to both interaction verification
when behavior changes and task-specific visual captures at desktop and mobile
viewports. The captures are retained for human review; they neither replace functional
assertions nor imply agent visual approval. Name the important states and whether the
scenario should remain in the project. For a behavior-only browser change without a
rendered UI, say so when requesting functional evidence only.

## Finish a task without losing evidence

Both Playwright scopes retain executed scenario sources and artifacts. Worktree drafts remain editable during the task. Once the final draft has been executed and resource cleanup has completed, use **Clean up worktree code** in Playwright to remove the recorded draft subtree.

Cleanup refuses active execution, unrecorded new or edited drafts, changed configuration and unsafe paths. Inspect any refusal and record intended changes before retrying. Successful runs and merges do not automatically remove drafts. Draft cleanup preserves history. Maintaining a scenario long-term requires explicitly moving it into `project` and updating imports or target matches as needed.

Continue to [results and screenshots](results.md), [troubleshooting](troubleshooting.md), or the [documentation overview](index.md).
