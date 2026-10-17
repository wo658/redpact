# Project configuration

Use this guide for setup or repair. `redpact settings describe --scope project` from the connected runtime
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

## Update one fixed configuration through CLI

Use `redpact settings describe --scope project --path /absolute/checkout` for schema,
ownership, defaults and diagnostics. Use `settings get` with the same scope/path
(and optional `--pointer`) to read current values and the whole-document revision.
Apply JSON Patch `add`, `replace`, `remove` or `test` operations with `settings patch
--revision REVISION --patch-stdin`. Preserve unrelated values; do not read or edit
settings/runtime JSON files directly. Use `--create` only when get reports no document.
Missing parent objects must be added explicitly. A failed patch or validation leaves
the original unchanged; on a conflict, read again and reconcile instead of retrying
blindly. Malformed or duplicate-key project JSON uses revision-checked `settings repair --document-stdin`
with a valid replacement; the server retains the original backup. Valid JSON with
field errors uses patch. A linked checkout cannot override the primary settings.
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
fallback exists. Supply private values through stdin, not command-line arguments or chat disclosure.
Settings get returns plaintext values (`redaction: none`), so request only the needed subtree.
Text masking does not sanitize captured settings, sources, screenshots or video.

Dockerfiles must build the actual application and install dependencies from its
lockfile. Compose retains native behavior; fixed ports, shared volumes or external
services can prevent concurrent isolation. Verify access from the actual consumer,
not just the host. Managed service DNS is `<service>.redpact.test`; localhost refers
to the consuming container. External services retain their origins and authentication.

## Observation and validation

Use `redpact projects connect --path /absolute/checkout` when connection is needed.
Use `settings describe|get|patch|validate --scope instance` for global settings;
preserve unrelated projects and port settings. Instance patches cannot change approval
policy or Git/GitHub settings. The full app and CLI enter shared settings workflows.
Existing-checkout binding can record an existing path without creating a worktree.

Use `redpact workspace status` and advertised read-only project/worktree APIs to verify
the observed root and checkout. Read-only status does not register missing projects.
A saved observation entry or successful configuration validation alone does not prove
discovery. Report unavailable or mismatched bindings without silently using another
instance or checkout.

Call `redpact settings validate --scope project` with the actual execution path. Fix field diagnostics,
missing services and source-discovery errors without weakening validation. Empty
settings may support inspection, but do not establish managed application readiness.

## Verify and report the agreed scope

Request a meaningful managed smoke check through `redpact tests run --kind KIND`
when included in the task. Preserve the request identity, approval state, terminal
result and cleanup. Ask requires explicit human action in the App or connected review;
the agent never invokes approval endpoints, extracts capabilities or switches to Auto.
Configuration validity, executed evidence and code acceptance are separate facts.

Host Git creates any needed verification worktree under the repository's policy.
Verify shared configuration against its actual checkout; do not repair a worktree
with private overrides or claim a fresh-worktree result from the primary checkout.
Commit, merge and publication follow the user's existing authorization, not an init
side effect. Missing Docker or credentials can leave runtime readiness unverified
while application-file authoring and CLI settings validation still proceed.

For Playwright, follow [authoring](../../redpact/references/playwright.md). Keep task
scenarios under ignored `worktree/{captures,tests}` and maintained checks under
`project/{captures,tests}` as configured; each target declares scope and purpose.
Do not create or run unrelated captures merely to complete setup.

Report actual paths, files authored/reused, fixed topology and connection facts,
validation/discovery, managed evidence and deferred checks. When topology helps
explain the setup, use the dependency guide's diagram. Link only returned execution
review paths on the same instance. No project selector or settings screen is required.
