---
title: Settings ownership
description: File ownership, scoped overrides, validation and reviewed promotion.
---

# Settings ownership

The [configuration guide](configuration.md) owns dependency modes, environment
binding semantics and worked examples. This reference defines where settings live,
how updates are admitted, and how worktree-specific changes become shared.
Use `configure describe` against the actual execution checkout for the exact schema;
API schemas are generated from implementation rather than maintained as a copied list.

## Files and resolution

| File | Owner and purpose |
| --- | --- |
| `<rulesRoot>/.redpact/settings.json` | Shared Compose, dependencies, Unit, Integration and Playwright declarations |
| `<projectRoot>/.redpact/dependencies.override.json` | Optional scoped overlay for linked worktree execution; ignored for primary execution |
| `<projectRoot>/.redpact/selection.json` | That checkout's future root services and dependency choices |
| `<rulesRoot>/.redpact/integration-defaults.json` | Project Integration and manual Container defaults |
| `<rulesRoot>/.redpact/tracking.json` | Main branch, hide-merged and include-branches preferences |
| `<data-dir>/settings.json` | Instance port, observed projects, approval, GitHub CLI and execution limits |

`rulesRoot` is the primary project directory; `projectRoot` is the selected execution
checkout's project directory. Resolve Compose, Dockerfile and test paths from the
execution checkout. A checkout-local `settings.json` does not replace shared rules.
There is one accepted project format, with no imports, format selector or migration.

An explicit execution selection takes precedence over saved worktree selection.
Missing initial choices require a selection; invalid saved choices fail rather than
being silently replaced. `configure inspect/validate` uses only the supplied selection,
not saved choices. Saving settings or selection never starts execution or grants approval.

Without saved project Integration defaults, each dependency chooses an available
mode in order `mock`, `isolated`, `shared-local`, `remote`. Application metadata supplies
root services; without it, use Compose services not owned by dependency modes.
This chooses declared modes, never implements a mock or promotes an assessment.

## Scoped dependency overrides

A linked worktree may override these fields only:

| Field | Replacement behavior |
| --- | --- |
| `dependencies` | Replace each named dependency completely; inherit unnamed entries |
| `applicationServices` | Replace named applications; inherit unnamed entries |
| `composeFiles` | Replace the entire ordered list |
| `relationships` | Replace the entire list |
| `testEnv` | Replace named `tests.env` bindings; inherit other test settings |

There are no deletion markers or arbitrary settings overrides. Adding a dependency
mode requires retaining every other mode that should remain in that definition.
Nested environment maps are not recursively merged. Include still-needed shared
Compose files when replacing `composeFiles`. Implement corresponding application,
mock and Compose changes in the same checkout.

HTTP, MCP, Unit, Integration and Playwright share the effective-settings reader.
Invalid overlays fail; no fallback hides errors. Duplicate keys, unknown fields,
unsafe paths, selected-variable collisions and source-size limits are rejected.
The effective digest includes primary and override source hashes. Validation checks
structure and consistency, not Docker availability, credentials or app readiness.

## Review and promotion

`configure inspect` returns `promotion` for a valid active overlay: the primary
`file`, complete effective `source`, `baseSha256` and `overrideSha256`. This is a
read-only candidate. Neither tests nor their approval promote settings.

At an authorized merge:

1. Synchronize with the target, re-inspect both hashes and review dependency changes
   together with Compose/mock implementation. Changed inputs require fresh verification.
2. Merge implementation files. Keep the task overlay local, outside the merge
   commit, and preserve it until promotion succeeds.
3. Read `GET /api/projects/:id/configuration`. Its revision must match `baseSha256`.
   Save the candidate through `PUT` with `{ source, revision }`. A conflict requires
   re-inspection and review, never a forced overwrite.
4. Verify the base and a linked worktree with the intended selection and actual app.
   Remove the unchanged reviewed overlay only after successful promotion. Commit
   shared settings if the project tracks them; otherwise report their local scope.

Git merge and settings promotion are separate operations, not a transaction.
Preserve the overlay and report incomplete promotion on failure. A local experiment
may remain explicitly unpromoted. Other worktrees need the merged implementation
before selecting a newly shared mode.

## Editor and display preferences

Project settings edits grouped application/test fields while preserving dependency
configuration. Dependencies owns its modes and environment values. Reads return
source, revision, parsed value and issues; writes validate and atomically replace
with revision conflict detection. Invalid JSON requires repairing the named file.
Open drafts are not silently replaced by observed external edits.

`playwright.locale` is Chromium configuration, while `playwright.uiLanguage` is the
declared language of UI labels in Playwright scenarios. The runner supplies the latter
as `REDPACT_UI_LANGUAGE`; application-specific test helpers initialize storage, cookies,
or routes from it before navigation. This makes a single-language application's locator
language explicit without claiming that every application follows browser locale.

Tracking stores `mainBranch`, `hideMerged` and optional `showBranches`. Sidebar
Worktrees controls visibility; Project settings controls the main branch. Browser
preferences such as theme, language, word wrap and hidden project menus are display
choices, not repository configuration. Blocked browser storage retains session use.

Port changes require restart. GitHub CLI and resource preferences affect subsequent
operations. Accepted runs, pending review inputs and existing environments keep
captured values when future defaults change.

Implementation: [settings schema](../app/server/src/core/settings-schema.ts),
[configure guidance](../app/server/src/workflows/configure.ts),
[settings reader](../app/server/src/adapters/settings/json.ts).
