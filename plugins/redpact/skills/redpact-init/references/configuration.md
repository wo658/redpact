# Project configuration

Use this guide for setup or repair. `configure describe` from the connected runtime
owns the executable schema; a plugin update does not update an older runtime.
Do not copy a static sample or newer unsupported fields over the application's settings.

## Inspect before authoring

Identify the absolute application checkout and the shared primary `rulesRoot`.
In a monorepo, preserve the application subdirectory when resolving worktrees.
Inspect manifests, lockfiles, build/start scripts, Dockerfile/Compose, service ports,
readiness, storage, existing tests and actual dependency consumers. Reuse accepted
provider choices and implemented substitutes. Ask only for facts not resolved by
inspection or the conversation.

Choose the requested capabilities. Unit requires a Dockerfile, finite complete
command, cwd and discovery patterns. Integration requires runnable application
services and an isolated Vitest source bundle. Playwright requires the application
service/port and declared functional/capture targets. Draft-only and unit-only
projects need no invented server, database or empty placeholder tests.

## Author one fixed configuration

Read `configure describe` for schema, ownership, defaults and diagnostics. Write
`rulesRoot/.redpact/settings.json` directly with applicable fields and preserve
unrelated settings. A linked checkout's settings copy cannot override the primary.
The selected checkout supplies actual Compose files, Dockerfiles and application/test
sources. Do not create alternate formats, default files, mode catalogs, worktree
overlays or a separate onboarding-state file.

Declare fixed root `services` and exactly one `kind` per dependency. Use the
[dependency guide](../../redpact/references/dependencies.md) for topology and runtime
verification. A `mock` label does not implement a substitute. Implement an agreed
substitute in application code, not a test-only fake presented as production readiness.

Application bindings use dependency `env` keyed by target service and variable.
Omission preserves defaults, strings override, and `{ "unset": true }` removes a
value. Two dependencies cannot write the same service variable, even to equal values.
`tests.env` is a separate common Integration/Playwright runner environment. Values
are explicit strings; no secret references, automatic dotenv loading or server-env
fallback exists. Use secure local editing for private values, not chat disclosure.
Text masking does not sanitize captured settings, sources, screenshots or video.

Dockerfiles must build the actual application and install dependencies from its
lockfile. Compose retains native behavior; fixed ports, shared volumes or external
services can prevent concurrent isolation. Verify access from the actual consumer,
not just the host. Managed service DNS is `<service>.redpact.test`; localhost refers
to the consuming container. External services retain their origins and authentication.

## Observation and validation

Read the instance settings path and `projects` schema from `configure describe`.
If needed, edit that instance file to observe the actual absolute root. Do not change
its port or unrelated projects without a task reason. There is no public settings
write endpoint. Existing-checkout binding can record an existing path but never creates
a worktree or writes project settings.

Use `get_workspace_status` and advertised read-only project/worktree APIs to verify
the observed root and checkout. Read-only status does not register missing projects.
A saved observation entry or successful configuration validation alone does not prove
discovery. Report unavailable or mismatched bindings without silently using another
instance or checkout.

Call `configure validate` with the actual execution path. Fix field diagnostics,
missing services and source-discovery errors without weakening validation. Empty
settings may support inspection, but do not establish managed application readiness.

## Verify and report the agreed scope

Request a meaningful managed smoke check through the appropriate MCP execution tool
when included in the task. Preserve the request identity, approval state, terminal
result and cleanup. Ask requires explicit human action in the App or connected review;
the agent never invokes approval endpoints, extracts capabilities or switches to Auto.
Configuration validity, executed evidence and code acceptance are separate facts.

Host Git creates any needed verification worktree under the repository's policy.
Verify shared configuration against its actual checkout; do not repair a worktree
with private overrides or claim a fresh-worktree result from the primary checkout.
Commit, merge and publication follow the user's existing authorization, not an init
side effect. Missing Docker or credentials can leave runtime readiness unverified
while file authoring and validation still proceed.

For Playwright, follow [authoring](../../redpact/references/playwright.md). Keep task
scenarios under ignored `worktree/{captures,tests}` and maintained checks under
`project/{captures,tests}` as configured; each target declares scope and purpose.
Do not create or run unrelated captures merely to complete setup.

Report actual paths, files authored/reused, fixed topology and connection facts,
validation/discovery, managed evidence and deferred checks. When topology helps
explain the setup, use the dependency guide's diagram. Link only returned execution
review paths on the same instance. No project selector or settings screen is required.
