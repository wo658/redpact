# Project configuration

Read this guide from `redpact-init` for project setup, or from `redpact` when development requires setup repair or configuration changes. The init skill configures the project and implements dependency substitutes agreed during setup; it is not a shell subcommand or an additional MCP tool. Use the connected server's `configure describe` as the authoritative schema; do not copy a static example as the application's configuration.

## Establish the minimum inputs

Inspect repository facts before asking; dependency mode decisions require the interactive discussion in the dependency guide. Use the current checkout and repository evidence when unambiguous, and briefly state consequential assumptions.

| Information | How to obtain it | When user input is needed |
| --- | --- | --- |
| Absolute target project directory | Current worktree, repository instructions, and the requested application; in a monorepo identify the actual application root | Multiple plausible targets and no clear requested app |
| Actual application build and startup contract | Manifests, lockfiles, source, scripts, existing images, Dockerfile and Compose; identify runtime files, listening address/port, storage and readiness | Required behavior or unsupported runtime constraints remain unresolved after inspection |
| Required dependencies and supported alternatives | Application configuration and clients, unconditional Compose prerequisites, implemented mocks and existing external integrations | Ask shared-local or remote usage first, agree on an Isolated-then-Mock minimum baseline, then ask about additions per app; reuse explicit prior decisions |
| Test source location and connections | Existing isolated Vitest bundle; use the schema's default directory only if suitable; identify service ports and any required test environment/secret names | Existing tests cannot be bundled without a scope decision or an external endpoint cannot be inferred |
| Instance observation destination | Actual instance settings path and projects schema from `configure describe` | The connected service cannot supply enough information to identify the instance safely |

Choose setup capabilities from the requested work and inspected project. Ordinary init of a runnable web application or server includes the application Container baseline below; it does not depend on having integration tests or third-party dependencies. Add unit commands, integration and Playwright as needed. Empty Compose catalogs are valid for explicit draft-only/unit-only setup or projects without a runnable server, but do not establish application Container readiness. An empty dependency catalog is valid for an app without dependencies. Unit commands require their declared Dockerfile runtime.

## Schema-complete initialization

Treat `configure describe` from the connected instance as the executable contract.
Read its `specification.schema`, file ownership and observation guidance before
writing any settings. Repository docs describe current product behavior, but a
plugin reinstall does not update an older desktop or development service. If the
live schema lacks a required current field, identify the connected instance and
report the runtime mismatch. Update that runtime only within the user's requested
scope, reconnect, and describe again before continuing dependent setup. Do not
silently delete a requested setting or add a compatibility format to hide a mismatch.

For `Unrecognized key: "uiLanguage"`, inspect the diagnostic's full file and field
path. It belongs inside `playwright`, only when that object's live schema supports
it; it is not a top-level project, instance, selection or tracking setting. Keep
browser `locale` separate from UI label language. If correctly nested but absent
from the live schema, resolve the runtime mismatch instead of retrying the same
file or assuming that repository source proves installed support.

Initialize a complete valid configuration for the selected capabilities:

- Enumerate the live schema's properties recursively, including nested objects and
  catalog entries actually used by the project. Resolve schema references rather
  than relying on a cached key list. Use declared defaults, then inspected project
  values. Write supported empty catalogs explicitly, including `composeFiles`,
  `dependencies`, `applicationServices` and `relationships`, and all `tests` defaults.
- For enabled Unit and Playwright, fill every defaulted field explicitly and supply
  real required inputs. Unit needs its actual Dockerfile, finite command and test
  patterns. Playwright needs an actual service, internal port and nonempty targets;
  include browser defaults, both viewports, UI language and each target's scope
  when supported. Derive language from the application, not the conversation alone.
- Use empty strings, arrays or objects only where the live schema permits them
  and their meaning is correct. Never use `null`, empty service names, zero ports,
  empty commands or invented paths to fill a required field. Optional capabilities
  without valid required inputs remain absent and are reported as unconfigured;
  do not enable a capability merely to make every top-level key appear.
- Optional descriptions, evidence, assessments and recommendations require real
  facts. Omit them when unavailable and report the reason. Do not generate fictional
  catalog entries, all dependency modes or conflicting union alternatives. Declare
  necessary secret references without reading or storing private values; request
  missing selected credentials through secure input.
- Keep project, instance, tracking, Integration defaults and worktree selection in
  their respective files. Fill only fields supported by each file's own schema;
  `projectsSchema` does not describe the entire instance file. Preserve existing
  instance preferences. Selection requires real root services and is not an empty
  placeholder. Browser display language is not a project setting.

On repeated init, read existing files first, preserve explicit values (including
`false`, `0` and allowed empty values), and fill missing defaults without replacing
user choices. Preserve omitted application environment bindings: filling those with
empty strings would override Compose defaults. Unknown or invalid existing fields
need a targeted repair based on diagnostics, never silent stripping or replacement
of the whole file with an example.

Read back the authored JSON, call `configure validate` for the same absolute checkout
and intended selection, then inspect the normalized settings. Check that all
applicable defaulted fields are explicit and match the live schema; repair omissions
and validate again if the file changes. Report capabilities or factual optional
fields left absent and why. Validation proves configuration validity only; retain
the readiness and observation gates below. No installation hook can infer the
application's required service, command, port or credentials without project init.

## Capability-specific setup

Read only the relevant setup sections: [Unit](../../redpact/references/unit-tests.md#native-redgreen-and-connected-evidence),
[Integration](../../redpact/references/integration-tests.md), or
[Playwright](../../redpact/references/playwright.md#setup-and-authoring).
For application containers, dependency relationships, modes, selections or connection
inputs, read [Project dependencies](../../redpact/references/dependencies.md).
Draft-only init reads authoring/setup requirements. Dependency registration also reads
the execution procedure needed for bounded mode verification.

## Application Container baseline

For ordinary init of a runnable web application or server, reuse or implement a
Dockerfile/image, suitable .dockerignore and Compose service for the actual app.
Derive build/start commands, workspace packages and runtime files from the project;
do not require the user to design Docker configuration. Register composeFiles and
application metadata using the live schema so project Container can select the app
through Integration defaults. Check the effective selection; preserve intentional
saved defaults and resolve any selection that omits the intended application.
A frontend without a database still needs its own application service.

Configure the application to listen on a container-reachable address such as
0.0.0.0, declare its internal port and healthcheck, and use managed dynamic
host-loopback publication. For a Redpact target, use its supported --host option;
other apps use their own startup configuration. Preserve access controls and
configure supported local origins where needed instead of disabling them. A
host-only dev command bound to 127.0.0.1 is not a usable container command.

Verify both container health and an actual protocol response through the published
host endpoint. For web apps, verify the intended page/API response, not only a TCP
connection, internal curl, a Docker healthcheck or a Ready label. Use the connected
service's advertised Container/managed execution operations and recorded endpoints;
do not guess allocated ports or invent an MCP preparation tool. Read the published
endpoint from that same environment and report its response and errors. These are
bounded setup checks, not screenshot review or unrelated test execution.

Apply this gate to the primary checkout and fresh verification worktree required
below. Project Container follows the configured main checkout; use a supported
checkout-scoped managed operation when verifying the fresh worktree. Do not count
a second main-checkout run as fresh-worktree evidence. If the runtime cannot verify
the required checkout, report the gap instead of substituting a clone or example.
Stop only resources created for these temporary checks unless the user requests a
running preview; preserve existing user sessions. Missing Docker, failed host access
or missing definitions leave application setup incomplete. Explicitly limited setup
reports Container as unconfigured, never as fully initialized.

## Init checkout lifecycle

A request to edit this plugin does not itself initialize the current repository.
For actual Git project init, inspect status, HEAD, registered worktrees, the primary
rulesRoot and intended future-worktree base. Work directly in the checkout of that
base branch, preserving monorepo subdirectories. Reuse its registered checkout;
do not create a separate init branch or repurpose a feature worktree. Do not assume
that the current branch or primary checkout is the intended base. Resolve an
ambiguous or unavailable base checkout with the user. Preserve unrelated dirty
changes; never stash, reset, switch their branch or include them in the setup commit.
Honor an explicit current-checkout restriction and report any resulting base-readiness
gap. Non-Git projects use their resolved directory without implicitly initializing Git.

Author Mock implementations, application env handling, nonsecret examples,
Dockerfiles and Compose in the base checkout. Apply repository test-first rules to
executable changes, with focused implementation and readiness checks. Init does not
automatically require feature acceptance scenarios or screenshots. Explicitly
requested UI review retains its own evidence rules.

Write live settings only at the shared primary `.redpact/settings.json` rulesRoot;
a different base checkout does not introduce a settings override. Keep unverified
candidates outside the selectable catalog. Follow the dependency guide's controlled
shared candidate verification procedure when needed, preserving unrelated settings
and restoring prior candidate fields on failure/interruption without clobbering
concurrent edits. Store real keys only through project-scoped secure input.
Never commit secrets or copy private env files between checkouts.

After bounded runtime checks pass in the base checkout, inspect the scoped diff
and make a local setup commit on the base branch unless the user requested no commit.
No separate init merge is needed. Init does not authorize remote publication or
committing unrelated work. If changes cannot be committed within the user's scope,
report the remaining fresh-worktree readiness gap without claiming full completion.

Verify the primary checkout and a fresh retained verification worktree created from
the setup commit using the same complete baseline selection. Use a project-owned
location such as `.codex/worktrees/init-verify-<slug>`. The fresh worktree must need
no Mock/Compose/env repair, copied secrets or base-only untracked files. Normal
package installation/build and managed provisioning remain allowed. If primary is
on a different branch, do not silently switch or merge it; resolve its missing setup
before claiming primary readiness. Existing feature worktrees need the setup commit
incorporated before reuse; settings sharing does not propagate source changes.
Record the base/setup commits, checkout paths, selection, actual operations and
outcomes in ordinary setup documentation. Clean up only owned verification resources
and clean disposable verification worktrees.

## Onboarding sequence

Resolve the target and read repository instructions. Discover the connected tools, call `configure describe`, then `configure inspect` with the absolute target path. Missing settings lead to authoring; valid existing settings lead to reuse or a focused repair. A repeated init should preserve unrelated configuration and avoid duplicate observation entries.

Inspect the application's actual Compose services, startup requirements, environment variables, and SDK/mock behavior. Reuse valid configuration; create or repair real Compose/Dockerfile definitions when needed for the requested local workflow. Do not invent placeholder services, silently substitute mocks, or use arbitrary host processes in place of requested managed application services.

For ordinary runnable-application init, or when managed integration is selected, setup includes the necessary container definitions. Missing Dockerfile, Compose, or settings files are work to perform, not a reason to ask the user to design the environment. Infer the setup from manifests, lockfiles, build/start scripts, source and existing deployment configuration. Explain the inferred setup briefly and proceed; infer mechanical container details and follow the dependency guide’s Existing-connection-first discussion, minimum baseline agreement and per-app additions question. Do not repeat mode or mock-implementation questions already covered by that agreement.

For the application Container baseline or selected managed integration, author a Dockerfile and .dockerignore when an application build is needed, or reuse a suitable existing application image. Compose must run the actual target application and required services, with correct build context, runtime files, writable storage, fixed internal ports and readiness checks. Check that listening addresses are reachable within the container network without weakening application access controls. Keep the installed Redpact service separate from the target. A project with no selectable service dependencies can use an empty dependency map; do not add a database or example service just to populate it. If the application cannot fit the supported environment contract, report the concrete incompatibility after investigation.

Author project-owned dependency infrastructure for explicit setup in the base-branch checkout; follow the lifecycle above. Feature worktrees reuse existing Docker/Compose definitions and select modes only; a setup failure does not authorize local infrastructure edits.

Write `.redpact/settings.json` directly at the shared `rulesRoot` returned by configure, using the live contract. Do not create a linked-checkout override; Compose and test paths remain relative to the target application directory. Keep the dependency catalog in settings and execution selection separate. Materialize applicable schema defaults as described above and preserve unrelated settings and omitted application environment bindings. Managed integration tests, helpers, and fixtures are project-owned Git-tracked sources under `tests.directory` (default `integration`), never under `.redpact`. Keep Unit patterns in a distinct directory so they cannot include Integration sources. Init does not invent unrelated test cases; agreed mock implementation requires relevant tests and bounded application verification. Use declared service connections instead of hard-coded allocated host ports.

For unit setup, inspect the adopted runner and configure the supported unitTests dockerfile/command/cwd/patterns in the shared settings; use a finite command and preserve existing settings. For UI setup, follow the Playwright section below. Init does not run unrelated commands or captures; dependency registration follows the
bounded verification exception in the dependency guide.

During init or a feature's first-time setup, project observation is required. Add the resolved project directory to the connected instance's `projects` if missing, using the instance settings path and schema returned by `describe`. Read the file back to verify the entry. Preserve existing projects and server settings. An explicit `path` on a configure call or a process-local `--project` default does not replace this persistent observation check. No separate MCP registration is required.

Verify that the connected server has discovered the project using its advertised read-only HTTP API. On the current server, read `GET /api/projects`, then the matching project's `GET /api/projects/:id/tracking` and `GET /api/projects/:id/worktrees`. Check the actual location and checkout paths, not just the project name. The tracking response's `projectRoot` supplies the viewer's Settings → Project root directory; it must match the primary-checkout application root. A linked worktree's execution path can differ from this shared root, including the preserved application subdirectory in a monorepo. Confirm the target checkout is present. Do not claim observation from a saved entry or successful configure validation alone. If discovery has not completed, use a bounded retry and report any remaining mismatch or unavailable API as an incomplete setup. Use the connected service's actual origin; do not guess a default port or inspect a different instance. These data checks require no browser or screenshots.

Call `configure validate` with the target path and intended selection when known. Correct diagnostics before execution. Validation does not establish Docker readiness or approval. If prerequisites cannot be satisfied, report the exact blocker and complete unaffected work; never claim the feature was tested through an unavailable environment.

For explicit draft-only requests, finish with draft files, validation and deferred checks without publishing unverified modes. Application Container setup includes the host-access verification above; dependency registration includes bounded temporary verification from the dependency guide. Missing Docker or other required access leaves registration incomplete; it does not prevent independent draft authoring or read-only validation. Do not run unrelated tests, unit commands or captures.

## Completion and return

Successful init requires all of the following evidence:

- The absolute target application directory exists and is unambiguous; identify the shared primary-checkout settings root separately when different.
- Shared `.redpact/settings.json` and the definitions needed for the selected capabilities exist and match the inspected project: command settings for unit execution, real application/Compose definitions for managed integration, and Playwright configuration for supported UI review.
- For runnable applications in ordinary init, real application Compose definitions and effective app selection exist, and both primary and fresh-worktree executions have verified host endpoint responses. An empty composeFiles list or internal healthcheck alone cannot satisfy this gate.
- The connected instance's settings readback includes the project observation entry, and live viewer API data confirms the project root and target checkout.
- Application/dependency roles, relationships and mode assessments reflect inspected evidence. When topology is present, include a Mermaid v12 flowchart in the handoff using the [dependency guide](../../redpact/references/dependencies.md#mermaid-dependency-overview). Report unresolved topology or mode questions and implementation recommendations separately from configured paths and execution readiness.
- The user has resolved required dependency choices through the Existing-connection-first flow, baseline agreement and per-app additions question, including selected credential needs and mock implementation scope. Agreed missing mocks are implemented and verified through the application; test-internal fakes do not establish readiness. Real-provider checks excluded from mock scope remain explicit.
- The integrated primary checkout and a fresh worktree pass the complete baseline selection: at least one verified mode for every required dependency, with no missing keys, unimplemented mocks or checkout-specific environment repair. Init-worktree-only evidence is not full completion.
- Every newly registered dependency mode passes the dependency guide registration checks, including primary/fresh-worktree resolution, actual runtime access and concurrent-use isolation. Required user inputs are resolved; private values never enter the agent conversation. Unverified candidates remain outside selectable modes.
- Live `configure validate` succeeds for the explicit target path. Resolve configuration diagnostics and test-discovery errors; an empty test directory is allowed for init and does not require inventing tests.

If a required fact cannot be inferred, ask for that fact and continue independent setup work. If a required check cannot be completed, report init as incomplete with the exact blocker; do not proceed into dependent execution or describe authored-only setup as initialized. An unresolved future execution selection may remain deferred, but required dependency decisions and agreed mock implementation may not. Missing Docker or unproven readiness required by a proposed dependency mode blocks its registration; follow the bounded verification workflow rather than declaring it usable.

Report the absolute execution path, shared project root, files changed (or valid files reused), verified observation status, actual validation outcome, known selection or unresolved choices, and deferred runtime checks. Provide the actual viewer URL and direct the user to select the project and open Settings → Project root directory so the resolved path is reviewable. Do not invent a deep link. If viewer access is unavailable, show the resolved paths in the response and state which live check is blocked. Do not write a separate onboarding-state file or store selections in project settings.

For init/configuration-only requests, stop here. For first-time setup within an authorized feature or test request, return to the main skill's implementation and execution workflow without requiring a separate redpact-init invocation.

## Playwright application review

For UI review, inspect actual application routes, Compose readiness and the live
`configure describe` Playwright contract. Use [Playwright authoring](../../redpact/references/playwright.md).
Configure optional `playwright` in the shared `.redpact/settings.json`: a scenario
directory, selected application service and internal port. Preserve unrelated
settings. The service must be part of a valid execution selection. Redpact owns the
browser container; the project supplies the actual application container.

Scenarios use ordinary `@playwright/test` and named PNG attachments. No component
catalog, separate renderer or setup registration is required. Init configures the
runtime and validates settings without inventing scenarios or starting a capture.


For Playwright setup, use `<directory>/worktree/{captures,tests}` for task-only code and
`<directory>/project/{captures,tests}` for maintained code. Configure four targets
with explicit scope and purpose, and add `<directory>/worktree/` to Git ignore rules.
Capture and functional executions both run only the selected worktree. Review the
[maintenance and execution contract](../../redpact/references/playwright.md) before
authoring examples. Keep logs and screenshots in Redpact history, not Git.

Worktree review includes task drafts and changed maintained scenario files; project
review keeps the full maintained scope. This is a source-file filter, not automatic
selection from application edits or image pixel changes. Execution runs the complete
chosen target. Do not alter unchanged maintained scenarios just to populate worktree
review; use a task-specific draft when that evidence is needed.
