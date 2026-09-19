# Worktree dependency changes and merge promotion

This guide supersedes restrictions elsewhere that permit only pre-verified mode
selection or require a separate infrastructure setup request for every feature.
A feature task authorizes the dependency additions, runtime mocks, Docker/Compose,
startup and environment wiring needed to implement and verify that task in its WT.
Reuse working definitions first. Ask only for unresolved product/provider choices,
necessary private inputs or consequential external actions. Do not repeat init's
baseline questionnaire for routine local dependency repairs. Explicit real-provider
requirements remain binding; a mock cannot replace requested real verification.

Read configure describe and its dependencyOverrides schema before authoring.
The shared primary settings remain the baseline. Write only the task's changes to
`<projectRoot>/.redpact/dependencies.override.json` in the linked worktree:

- `dependencies` and `applicationServices` replace whole named entries and inherit
  unnamed entries. Include modes that must remain; env is not recursively merged.
- `composeFiles` and `relationships` replace their complete lists.
- `testEnv` replaces named test environment bindings, preserving other test options.

Keep the overlay local, excluded from Git without overwriting project ignore rules.
Edit task-owned Compose and mock implementation files in the WT and commit those.
Do not write the primary settings while developing. Secrets remain references to
project keys; do not copy private values into the WT. Unsupported runtime schemas
are explicit blockers, not permission to invent settings support.

Validate the full selection, then execute the actual app's required Integration
and frontend Playwright functional checks. Fix task-local setup failures within the
authorized scope. A mode name, schema pass or test-internal fake is not readiness.
Do not finish or auto merge with required dependency execution still broken.

## Final authorized merge

Re-inspect current settings with configure inspect. Its promotion contains the full
candidate source and baseSha256/overrideSha256; review these alongside implementation
changes. A test-run approval does not authorize a Git merge or settings promotion.
An explicit merge request or applicable auto workflow covers this final promotion.

Synchronize and merge the implementation/Compose files into the intended base.
Keep the local overlay until promotion succeeds. Read the project's configuration
through GET /api/projects/:id/configuration and require its revision to equal the
reviewed baseSha256. PUT the candidate source with that revision to the same route.
If either reviewed input changed, regenerate and reverify; do not force past a
revision conflict. The base must contain the referenced Compose and mock files.

Verify the base and linked checkout with the promoted selection. Remove the WT
overlay only if it still matches the reviewed overrideSha256. Commit shared settings
when tracked, or report their local-only scope. Git merge and settings promotion
are separate operations: preserve the overlay and report an incomplete handoff if
promotion or verification fails. Existing WTs need the merged implementation files
before using the new mode. Never advertise automatic propagation of source code.
