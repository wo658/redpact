# Project dependencies and application environment

Read for project runtime dependencies, service topology, modes, connections or app
container changes. Package installation alone follows the project's package manager;
do not model every npm package as a Redpact service dependency.

## Inspect and configure

Call the connected `configure describe` with the absolute execution checkout before
editing settings, and inspect existing settings. Use the returned live schema and
shared `rulesRoot`; keep execution selection separate from shared definitions.
If project observation or general setup is missing, read only the needed
[configuration procedure](../../redpact-init/references/configuration.md#onboarding-sequence).
Valid setup needs focused changes, not repeated onboarding. Preserve omitted env
defaults, explicit overrides/unsets and unrelated fields; reject selected collisions.
A schema mismatch is a setup gap, not permission to invent a fallback contract.

## Worktrees select; project setup owns definitions

Ordinary feature/fix worktrees only select already verified dependency modes.
Reuse the project-owned dependency catalog and its existing Dockerfiles, Compose
files, images, startup scripts and environment mappings unchanged. A feature task
or a failed test does not authorize rebuilding or repairing this infrastructure,
either inside the worktree or silently at the shared primary root. This applies
to Unit, Integration and Playwright execution, including application containers.
Worktree-local execution selections and task test sources remain separate.

If a mode is missing, unusable, or requires a definition change, inspect the cause,
continue independent feature work and ask the user to resolve a project-level setup
change. Only an explicit dependency/infrastructure setup request authorizes editing
those project-owned definitions directly in the intended base-branch checkout; follow the init checkout lifecycle. Verify that common setup for
worktree reuse before resuming dependent execution. Do not add worktree overrides,
copy env secrets, hard-code ports or patch Dockerfiles to get one task to pass.
Preserve unrelated user edits; do not reset them to enforce this rule.

The current runtime shares settings.json but resolves Compose/build files from the
execution checkout. Reuse the unchanged tracked definitions present there; this is
not a centrally mounted infrastructure bundle. Missing or divergent definitions are
a project setup/runtime gap, not permission to author a worktree variant. Do not
claim automatic propagation to old worktrees or silently copy files from primary.

## Application topology and dependency modes

Separate the code being developed and reviewed (`applicationServices`) from services
it consumes (`dependencies`). Inspect source calls, server clients, browser SDKs,
workers, webhooks, environment configuration and Compose definitions. Repository
location alone does not determine the role: a web, API and worker developed together
can be separate application nodes; a separately consumed API is a dependency.
Application nodes map to actual Compose services. A logical application or dependency
can span several containers; do not turn every container into a separate logical node.
Unit-only setup need not invent Compose services just to populate an overview.

Author `relationships` for observed app-to-app and app-to-dependency usage. Each entry
names the consuming application, a typed target, its purpose and inspected
project-relative source locations (with accurate line numbers when supplied). Compose
startup ordering alone does not prove application usage. These are authored code
relationships, not observed network traffic, startup edges or service activation.

## Mermaid dependency overview

When explaining or handing off application topology, provide a fenced `mermaid`
`flowchart LR` derived from the same inspected `applicationServices`, `dependencies`
and `relationships`. Use Mermaid v12 syntax with `layout: elk` in frontmatter;
let the renderer calculate positions. Use stable, distinct ASCII node IDs for
application and dependency roles, quoted display names, and arrows from consumer
to provider. Escape Mermaid-special characters in labels. Include isolated declared
services; never invent edges to make the diagram look connected. State unresolved
relationships outside the graph and cite source evidence in the accompanying prose.

The viewer pins Mermaid 12.0.0 and derives its graph from structured settings.
Mermaid is the presentation format for the response, not another settings field
or executable contract. Keep writing the existing structured definitions and
validating them; do not replace them with raw Mermaid or add a diagram settings file.
Do not emit click callbacks, links, HTML labels or credential values in the diagram.

```mermaid
---
config:
  layout: elk
---
flowchart LR
  app_web["Web"] --> app_api["API"]
  app_api --> dep_database["Database"]
```

## Mode assessments and selection

Only these four dependency mode names are allowed. Application services do not have
these modes; they are the application under review.

| Fixed mode | Meaning | Required implementation |
| --- | --- | --- |
| `isolated` | Run the real dependency through Docker/Compose | Actual dependency services in nonempty `services` |
| `mock` | Simulate dependency behavior | Implemented app substitute, stub or emulator; optional Compose services |
| `shared-local` | Connect to an already running local real service | Verified container-to-host access; no provisioned services |
| `remote` | Connect to a Cloud or remote real service | Implemented integration, available connection inputs and verified worktree access; no provisioned services |

Sandbox, staging and production describe `remote` connection targets, not modes.
A sandbox API still needs the provider's available environment and any required
credentials. A containerized mock remains `mock`. No custom mode is accepted; classify
a user's proposed approach by the behavior it implements or explain why it does not
fit. Never add a mode solely because an environment flag can be declared.

Assess all four approaches for each dependency using the inspected implementation
and, where needed, verified provider capabilities. Put only implemented paths that pass the registration checks below in `modes`. For other approaches, use `assessments` with `unavailable` or
`implementation-needed`, a concrete reason and real source evidence. Explain necessary
code/configuration work in the reason. Never invent file references; local client
code can ground the integration being assessed but does not by itself prove that a
provider cannot be self-hosted. Explain the basis for provider limitations in the
reason and cite verified external sources in the handoff when used. If evidence is
insufficient, omit the assessment and report the uncertainty; omission means
unassessed, not unsupported. Do not invent a fourth status or an executable mode to
fill the catalog. Inspect all four without requiring all four to be configured.

For local verification, prefer a practical real self-hosted dependency when supported.
When self-hosting is unavailable, recommend `mock` if it can cover the intended local
behavior, especially when the provider's external test environment cannot be used.
Record a separate `recommendation` with a reason; it may point to a configured mode
or a mode needing implementation. Describe mock work across server clients,
browser SDKs and webhook flows as applicable. A test-internal fake response does not establish an application runtime mode.
Follow the init discussion and implementation requirements below before registering
a mock; an environment flag or successful isolated test is insufficient. Keep meaningful
application validation and state changes in the real application path.

An explicit request for real API verification takes precedence over local mock
recommendations. Verify the suitable real mode before registration; resolve missing access or
inputs with the user rather than quietly substituting a mock. Configured declarations,
recommendations, execution selection and runtime readiness are separate facts.

On repeated init, reconcile inspected relationships and assessments with existing
user-authored metadata, preserving unrelated settings and choices. Explain material
changes and do not overwrite unexplained user edits based on guesses. Invalid old
mode names require deliberate reauthoring against inspected runtime behavior,
including affected selection references; do not mechanically rename `sandbox` or
introduce compatibility readers, imports or migration machinery. If the connected
schema cannot express the required contract, report that mismatch and preserve the
existing files instead of downgrading the design or claiming validation success.

## Required dependency discussion during init

Inspect the application first and group required and optional dependencies by
consuming app. Explain choices in the user's language. Deduplicate dependencies
shared by several apps; package dependencies are not service dependencies.
Use this sequence instead of requiring a four-way choice for every dependency:

1. **Ask about shared-local or remote first.** Ask whether the user wants to connect any existing
   Cloud service or independently managed, always-running local service, and which
   dependencies should use it. These connection modes describe existing real services, not a
   requirement for an API key. Existing keys or repository flags do not imply consent.
   Reuse explicit prior choices without asking again.
2. **Establish the minimum baseline.** For dependencies not selected as shared-local or remote,
   propose practical real `isolated` services when supported; otherwise implement
   a runnable `mock` covering the agreed local application scenarios. Explain the
   concrete baseline and mock limitations and obtain agreement to this policy and
   scope if not already given. That agreement covers the resulting per-dependency
   choices and necessary mock implementation; do not ask the same mode question for
   every dependency. Assess actual self-hosting feasibility before choosing Mock.
   A Compose simulator is still `mock`. Minimize required private inputs and services
   while retaining every dependency needed for the agreed application behavior.
3. **Ask about additions per app.** Present the baseline grouped by app and ask
   whether each app needs additional optional integrations or alternative modes.
   A single grouped question may cover several apps. Share common definitions and
   request no additional keys or modes when the user wants only the baseline.
   Additional modes must pass the same registration checks; they are not required
   merely to fill the catalog.
4. **Resolve selected inputs and verify.** For chosen shared-local or remote connections, resolve
   endpoints and only the private inputs actually required. Explain secure input
   and the representative verification operation before `request_keys`. Reuse
   available registered keys without requesting their values. Authentication-free
   shared-local services need no key request. Verify the complete baseline and
   selected additions through the actual application before advertising readiness.

An unanswered connection-choice or additions question is not a negative answer. Continue
independent inspection or setup while waiting. Unit-only setup with no service
dependencies needs no artificial questionnaire. Repeated init preserves established
choices; ask only about new dependencies, requested additions or material changes.
If a selected shared-local or remote connection lacks keys, do not silently switch to Mock: resolve
access or a changed choice with the user. Likewise, if neither Isolated nor a
meaningful Mock can support the agreed behavior, explain the gap and resolve scope
rather than claiming a minimum baseline exists. Explicit real-provider verification
requirements remain binding; Mock cannot establish real-provider behavior.

For managed integration, execution selection remains separate: root services and
exactly one mode per declared dependency. Derive selection from the agreed choices
or reuse a matching saved selection. Outside init, ordinary feature execution may
reuse verified modes without repeating onboarding. A future run's selection may be
deferred; a dependency choice required for the agreed init scope may not.

## Implement the agreed runtime mock

If local app verification needs a mock that does not exist, proactively propose
implementing it during init. Explain the affected adapter/SDK/webhook paths, minimum
useful scenarios, limitations and verification plan, then request the user's
implementation decision if that scope is not already authorized. Do not end at
`implementation-needed` or suggest test-local canned responses as completion.
If implementation is declined or deferred, record the narrowed agreed scope and
leave the affected dependency setup incomplete rather than claiming app readiness.

Once agreed, implement the dependency substitute and necessary app wiring as
project-level setup in the intended base-branch checkout. This authorizes the agreed dependency
work, with local commits governed by the init checkout lifecycle; it does not authorize
unrelated product features. Follow repository test-first
requirements and the relevant test guide. Keep real application validation,
authorization, persistence and business transitions on the exercised path. Use a
runnable mock service/emulator or application runtime adapter reachable from the
actual application; cover browser SDK and callback/webhook behavior when required
by the agreed flow. Provide deterministic scenario controls, reset/isolation and
startup/readiness appropriate to that scope. Prevent mock mode from accidentally
falling through to real provider calls.

Verify through the running application's normal entry points and dependency adapter,
including representative success, failure and state changes for the agreed scope.
Test-runner interception, patched clients, or fabricated provider results inside a
test do not prove the mock is usable by the whole application. Record actual
execution evidence and apply the registration/worktree checks below before
promotion. Relevant implementation tests and bounded application checks are part
of this agreed init work; unrelated suites or captures are not required.

For example, if a telephone gateway and PortOne have only test-local fakes, explain
that runnable mocks must be implemented for local app verification. Agree on the
needed call/payment lifecycle and callbacks, implement and exercise those paths,
and report real telephone delivery and real payment processing as separate,
unverified integration scope. Do not infer provider self-hosting support or real
integration success from this example or from mock results.

Store ordinary environment values directly as strings: public endpoints, mock credentials,
local service connections, feature flags and values used by internal application code.
Inspect the actual client and requested mode; a name containing KEY, TOKEN or PASSWORD
is not evidence that it needs a private credential. Do not replace known ordinary
values with same-named secret references. Reuse known literals without asking the user.

For a requested external integration, identify the authentication keys actually
required by the application (for example its authorization header). Declare only those
unknown private inputs as `{ "secret": "NAME" }`. While preparing candidate settings,
resolve the observed project ID and call the advertised `request_keys` tool with that
project ID and only those required names. The MCP input card accepts values directly;
never ask the user to paste credentials into chat, call the app-only `submit_key` tool,
or read private storage. Read availability through the advertised project secrets API
without requesting values. Existing configured keys do not need another request.

The key request belongs to init, before claiming the requested external setup is complete.
Continue independent configuration while waiting; missing keys leave that connection
incomplete. Do not request keys for alternatives that will remain unregistered or for modes
that do not require private credentials. If the host cannot render MCP Apps or the server lacks `request_keys`, explicitly
report the missing input UI and point to the actual project's environment-variable
editor for direct user entry. Do not pretend a card opened or defer missing credentials
silently until execution. Docker availability, image pulls and application readiness needed for mode
registration must be checked before promotion into the shared catalog. Init does not require a feature definition, acceptance tests, run/environment IDs, a new branch, a server port choice, or an approval-policy change.

## Verify before registering a mode

The shared `modes` catalog advertises methods usable by worktrees. Source code,
environment-variable declarations, a provider SDK, a saved key reference and a
successful `configure validate` are not evidence that a method works. Apply this
rule to shared-local, remote, isolated and mock modes, including optional alternatives.

Before promoting a candidate into the shared catalog:

- Resolve the actual endpoint, runtime implementation, required credentials and
  supported behavior. Ask the user for missing nonsecret facts or a consequential
  choice; obtain private values only through the secure key input flow. Do not
  finish registration while required input is pending.
- Verify shared rules and project-scoped key availability resolve from a fresh
  linked worktree as well as the primary checkout. Compose/build/test files must
  exist in execution checkouts; do not rely on primary-only untracked files,
  a developer shell, copied private env files or an arbitrary host process.
- Run a bounded check from the actual execution network using the application
  adapter: authentication and a representative operation, not only a public health
  endpoint. For isolated/mock modes verify startup, readiness and implemented
  behavior. For a shared-local server verify container-to-host reachability
  and its independently managed lifecycle.
- Verify simultaneous worktree use is supported: ports, per-run data/identifiers,
  credentials, quotas and cleanup must not cause cross-worktree interference.
  Check browser callbacks, OAuth redirects and webhooks where the advertised
  behavior needs them. Record scope limitations instead of implying full support.

Use existing current evidence when it proves these same conditions. Otherwise a
registration request includes necessary temporary, non-destructive verification;
use the supported execution workflow and clean up its owned resources. Actual calls,
charges, production writes or other consequential external actions require existing
specific authorization or a concise user question before execution. Do not start
such actions merely to prove a dependency works.

Keep unverified proposals outside the selectable catalog. Draft candidate settings
outside the live shared settings until checks pass. If the runner requires shared
settings to validate a candidate, explain that limitation and resolve a controlled
verification plan with the user before temporarily publishing the candidate; restore
the previous catalog on failure or interruption. Do not invent schema fields or
statuses. Use supported assessments only when their meanings fit; record unknown
readiness in the handoff, not as `unavailable` or a fabricated implementation gap.
For existing unverified entries, report the gap and repair with the user; do not
silently delete unrelated choices or call them verified because they already exist.

Record the checked checkout/network, operation, outcome, worktree sharing evidence
and remaining limitations in the project setup documentation. Registration is
complete only when the proposed method works within that stated scope. If Docker,
keys, connectivity or necessary authorization remain missing, finish independent
work but leave dependency registration incomplete. An explicit draft-only request
may defer execution; its draft must not advertise unverified selectable modes.

## Minimum working baseline for init completion

For the requested application scope, establish at least one verified mode for every
required dependency and one complete, jointly verified selection. Checking each
mode separately is insufficient: run the actual application with the combined
selection, its prerequisites and target-specific env mappings. Record this baseline
for subsequent worktree selection, keeping execution choices separate from settings.
An assessment-only dependency, missing selected key, unimplemented Mock, unavailable
image or startup failure blocks completion even when `configure validate` passes.
Do not remove required dependencies, weaken assertions or silently narrow the agreed
scope to manufacture a pass. Optional alternatives may remain assessments/drafts;
never advertise them as selectable until verified.

Check effective startup inputs across app, worker, test-host and browser paths as
applicable. Compose interpolation, unconditional prerequisites, eager SDK creation,
image defaults or `tests.env` must not require external keys for a Mock-only baseline.
For example, selected PortOne Mock must start and execute its agreed flow without
`PORTONE_API_KEY`; if it still requires that key, fix the agreed mode wiring in init.
Do not fill a real-provider secret with a dummy value merely to bypass preparation.
A selected shared-local or remote mode with a missing key fails the gate instead of falling back.

Use bounded startup and representative app operations to demonstrate readiness;
no screenshot capture or human visual review is required solely for init. If browser
SDK/callback behavior is part of the promised scope, verify that behavior through
the appropriate runtime check, without substituting visual layout approval for it.
Verify the primary and fresh worktree after the base setup commit as specified in the
[init lifecycle](../../redpact-init/references/configuration.md#init-checkout-lifecycle).
Report observed readiness for the recorded revision and environment, not a permanent
guarantee against future provider outages, expired keys or source changes. A later
failure remains a setup regression to resolve, never a reason to claim verification.

## Application containers

Inspect manifests, lockfiles, build/start scripts and existing deployment files.
Only explicit project-level setup work may create or repair Dockerfile/Compose
definitions in the intended base-branch checkout and commit them on that base.
Ordinary feature worktree Integration or Playwright
work reuses these definitions unchanged. Include runtime files, writable storage, reachable
listening addresses, internal ports and readiness checks. Do not weaken app access
controls or substitute a placeholder app. Missing container files during feature
work require project-level setup resolution with the user; do not repair them incidentally in a feature worktree. Unit-only runtime setup belongs to
the Unit guide and does not require Compose application services.

## Completion and return

Read back authored settings and validate against the execution checkout and intended
selection when known. Check that declarations match inspected implementation, required
connection inputs are available, and unrelated definitions remain intact. Report
unassessed modes, implementation recommendations and unavailable credentials honestly.
Validation does not start services, establish readiness or approve execution.

For a draft-only request, report validation and deferred checks without publishing
unverified modes. A dependency registration request requires the verification above. Within feature/test work, return to the selected Integration or
Playwright guide and execute against fresh application inputs; authored configuration
alone does not complete that evidence path. If the connection fails, restore the
configured service without starting a second writer or fabricating runtime records.

## Feature worktree exception

[Worktree dependency changes](dependency-overrides.md) supersedes selection-only
restrictions for task-required additions, repairs and runtime mocks. Apply that
procedure for WT overrides, actual execution verification and final merge promotion.
The init discussion below/above remains for initial project-wide setup.
