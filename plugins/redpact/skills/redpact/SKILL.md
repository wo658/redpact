---
name: redpact
description: Develop through chat with Redpact-managed verification, test-first implementation and isolated worktrees. Inspect checkout status, request Unit, Integration or Playwright execution through CLI, and return recorded evidence for human review. Use auto for verified local merge and current for the existing checkout. Initial project setup belongs to redpact-init. Use when the user invokes Redpact; ordinary repository work alone does not require this workflow.
---

# Redpact

Develop the requested application from the conversation and provide recorded evidence
a human can review. Use the actual checkout throughout. The host agent owns files,
TDD and Git; Redpact owns managed execution, evidence and request approval. Its viewer
is for reviewing results and resolving decisions, not a required sequence of manual
navigation before every operation. Honor explicit scope and execution restrictions.

## Start and continue from chat

Read repository instructions, inspect the actual checkout and reuse this task's
worktree or create isolation through the host's Git tools. Call `redpact workspace status`
with its absolute path to inspect configuration diagnostics, pending approvals and
recorded execution state. A status read does not register or execute the project;
use `redpact settings describe/get/validate --scope project` when setup needs attention.

Choose evidence from the requested behavior, write a regression, observe its intended
assertion fail, implement, then rerun. Use subagents for independent work when available;
give each an explicit file boundary and the same checkout/evidence identity. The parent
integrates their changes and verifies the final tree. Delegation is not verification.

Use the CLI commands below for requests and follow their returned identities.
Select the connected instance with `--server URL` (or `REDPACT_SERVER_URL`), pass the
actual checkout with `--path`, and request `--json` for structured results. Do not
switch instances or depend on the GUI's selected project. Use native Git and ordinary
file tools for application files; use Redpact CLI for its owned state and settings. Ask policy
requires the user's action in an MCP App or the connected viewer. If the client cannot
render Apps, call `redpact runs context` with the returned kind and request ID and provide
its review path on the connected viewer origin for the user to review and approve.
Never invoke an App-only approval tool, submit the viewer's approval request on the
user's behalf, copy a capability into model context, or change policy to proceed.
Polling and text replies do not approve execution. If neither approval interface is
accessible, retain the pending request and explain that remaining blocker.

Use `redpact runs context` for a compact result, failure and evidence references, then
`redpact runs logs/source/artifact` for the required recorded evidence. Return the provided
review path on the same connected viewer origin; do not infer a new server or claim
the result is fresh when freshness is unknown. Use `redpact runs list` for older attempts
and report cleanup failures with their execution identity. Public test cancellation is unavailable.

## Managed execution boundary

When an acceptance path is selected, execute it through Redpact so its immutable
inputs, result, artifacts and cleanup record stay on the connected worktree. Do
not substitute direct `docker`, `docker compose`, `vitest`, `playwright`, package
scripts, or shell commands for connected evidence. Those commands may support a
local red/green cycle, but they do not create Redpact execution evidence and must
be reported as local-only.

| Test type | Required connected entry point | Evidence owner |
| --- | --- | --- |
| Integration | `redpact tests run --kind integration`, then `redpact runs show` | Integration submission and run |
| Playwright functional or capture | `redpact tests run --kind playwright` with a declared target, then `redpact runs show` | Playwright run, recorded artifacts and cleanup |
| Unit | `redpact tests run --kind unit`, then `redpact runs show` | Whole configured command, output and cleanup |

`redpact tests run --kind KIND` selects Integration, Unit or Playwright. Unit runs the
configured command/file-command contract; Playwright requires `--target`. Use `--test`
for Integration file selection only. Use `runs show/context` with `--kind` and `--id`;
`runs logs/source/artifacts/artifact` retrieve recorded evidence. `--wait` stops at an
approval requirement or terminal result; a client timeout never cancels execution.
An accepted request is not a passing test.
Likewise, do not describe a direct Docker run as a Redpact run or recreate its
records manually. If the required Redpact endpoint, settings or approval is
unavailable, finish independent work and report the connected-evidence gap.

## Invocation

In Codex, use `$redpact` and `$redpact-init`. In Claude Code, use
`/redpact:redpact` and `/redpact:redpact-init`; the same task modes apply.
Use the plugin's configured instance origin for CLI and the viewer. MCP opens the
app; operational work uses the installed `redpact` CLI.
The regular plugin defaults to port 54321 and does not install or start the runtime;
start `redpact serve --port 54321`. The App Page package
bundles these same skills with its verification connection on port 54322 and manages
runtime startup separately. Never switch instances just because a default is familiar.
MCP Apps approval cards require a compatible host; the connected viewer provides the
same explicit human approval flow when Apps are unavailable. Use the returned review
path and preserve the requested instance and approval policy.

| Request | Completion scope |
| --- | --- |
| `$redpact <task>` | Isolated worktree, required verification, local commit and review handoff |
| `$redpact auto <task>` | The same verification, then local commit and local merge |
| `$redpact current <task>` | Required verification and local commit in the existing checkout |

Auto mode requires `auto` or an explicit request to verify and finish through local
merge. It applies only to that task; never infer it from task size or earlier tasks.
It does not reduce verification requirements or imply human review approval.
Follow [Worktree and checkout lifecycle](references/worktree.md) for scope limits,
merge target selection and completion.

Ordinary feature worktrees reuse the shared project configuration. Resolve required
setup within the user's authorized task, reading the dependency guide before changing
Docker/Compose or shared settings. Preserve unrelated values and explain effects on
future executions. Ask only for missing provider choices, credentials or scope that
cannot be inferred; do not introduce another approval for routine authorized repairs.

## Select the next guide

Inspect repository instructions, relevant source, settings and existing tests first.
Choose the guides that answer the task’s actual review questions. Read each selected
guide before its first dependent action, then follow its procedure and completion
criteria; this table is a router, not a substitute for those instructions. Do not
load every guide at kickoff. Load another only when the work reaches its boundary.

| Situation | Guide to read |
| --- | --- |
| Feature/fix, existing checkout, worktree, commit or merge | [Worktree and checkout lifecycle](references/worktree.md); `current` stays in place, ordinary feature work uses isolation |
| Public API, persistence, service interaction or application behavior | [Integration tests](references/integration-tests.md) as the default acceptance path |
| Frontend navigation, forms, state or user-visible interactions | [Playwright](references/playwright.md) and [Functional browser tests](references/playwright-functional.md) by default; add a capture target when the change is user-visible UI |
| Frontend and backend behavior changed together | Playwright user flow plus Integration for changed API/persistence contracts not adequately covered by that flow |
| Complex pure calculations, branches or edge cases | [Unit tests](references/unit-tests.md) as focused supporting coverage |
| User-visible UI change | [Playwright](references/playwright.md) and its capture guide by default; retain captures for human review, separate from functional assertions |
| Project dependencies, service topology, connections or app containers | [Project dependencies](references/dependencies.md) |
| Missing/invalid setup or initial project observation | [Configuration](../redpact-init/references/configuration.md), then return to the selected work |
| Existing evidence review or final handoff | [Review evidence](references/review-evidence.md) |
| Results, cancellation or cleanup | Only the guide owning that execution or resource |
| Workflow question or skill edit | Inspect/edit the relevant skill files; do not start application development |

Use the dependency guide’s Mermaid v12 flowchart format when presenting service topology.

Dependency configuration supports the selected test paths; it is not another test
layer. Valid existing setup does not require onboarding again. Copy/documentation
and visual-only changes use relevant source/build/review checks without invented TDD.

## Choose acceptance evidence before implementation

Start from observable acceptance outcomes, not the type of file or function edited.
Choose Integration at the actual application's public boundary first. For frontend
behavior, default to Playwright functional tests through actual routes and controls.
For a user-visible UI change, also default to a separate actual-application capture target
at desktop and mobile viewports. The capture is retained for a human to inspect; the
agent need not claim that it visually approved the image.
For combined frontend/backend work, cover the user flow and add Integration where
changed API or persistence contracts need independent assertions; avoid duplicating
identical coverage merely to fill every layer.

Write the relevant acceptance regression before implementation and observe its
intended assertion fail, then pass with the changed application. TDD is not limited
to Unit. Add focused Unit tests where complex rules or edge cases benefit from them;
component tests supplement rather than replace real browser behavior evidence.

Unit-only verification is appropriate for isolated pure logic with no changed user
flow, rendered UI or external contract, with a concrete reason. Documentation and
static configuration use relevant static/build/review checks without invented behavior
tests. Visual-only UI changes still require a capture target, but do not invent
functional assertions. Respect explicit execution restrictions and explain their actual
scope: a ban on browser layout inspection alone does not ban functional browser tests.

## Carry the required work to completion

State the observable acceptance intent and selected evidence briefly, in the task’s
language. Choose routine test/setup details from the project rather than delegating
them to the user. Reassess the selection when implementation crosses another boundary.

Complete the guides required by the changed acceptance outcomes within the
user’s scope. Keep a lightweight record in the current task of what is pending,
observed or blocked; do not create another registry. Configuration, authored tests,
a started run or a green unrelated command cannot close a selected evidence path.
Report concrete blockers and finish independent work without fabricating evidence.

Missing Integration or Playwright setup is a verification gap, not a reason to
silently downgrade to Unit. Finish independent work and report the blocker; do not
claim completed verification or merge while required evidence is missing.

Before finishing, read the review handoff guide and reconcile every changed
acceptance outcome with required evidence, its observed result or explicit gap.
Explain any Integration or Playwright omission by relevance or an explicit restriction;
the fact that a guide was not selected is not an exemption. Local checks, connected evidence, visual
inspection and human approval are separate claims.

## Shared configuration changes

Task-required dependency changes use `redpact settings get/patch/validate --scope project`
with the actual checkout path and current revision. Never directly read or edit
project or runtime settings JSON. Read
[Project dependencies](references/dependencies.md), preserve unrelated inputs and
report effects on future executions. There are no worktree overlays or promotion
steps. Execution still uses the selected checkout and fresh runtime resources.
