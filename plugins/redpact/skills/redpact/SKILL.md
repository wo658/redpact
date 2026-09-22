---
name: redpact
description: Develop through local Redpact with integration-first acceptance and actual application Playwright functional tests for frontend work. User-visible UI changes also produce human-reviewable Playwright captures; focused unit tests support both. Use auto for verified local merge and current for the existing checkout; feature work otherwise uses an isolated worktree. Initial project setup belongs to redpact-init. Use when the user invokes Redpact; ordinary repository work alone does not require this workflow.
---

# Redpact

Develop the requested application and provide evidence a human can review. Resolve
the target from the request and repository; keep the connected Redpact service
independent from that application. Honor explicit scope and execution restrictions.

## Managed execution boundary

When an acceptance path is selected, execute it through Redpact so its immutable
inputs, result, artifacts and cleanup record stay on the connected worktree. Do
not substitute direct `docker`, `docker compose`, `vitest`, `playwright`, package
scripts, or shell commands for connected evidence. Those commands may support a
local red/green cycle, but they do not create Redpact execution evidence and must
be reported as local-only.

| Test type | Required connected entry point | Evidence owner |
| --- | --- | --- |
| Integration | MCP `run_tests`, then `get_run` | Integration submission and run |
| Playwright functional or capture | Redpact Playwright UI/API with a declared target | Playwright run, UI Review artifacts and cleanup |
| Unit | Redpact Unit UI/API with the configured whole command | Unit run, output and cleanup |

MCP `run_tests` is Integration-only: never use it for Unit or Playwright files.
Likewise, do not describe a direct Docker run as a Redpact run or recreate its
records manually. If the required Redpact endpoint, settings or approval is
unavailable, finish independent work and report the connected-evidence gap.

## Invocation

In Codex, use `$redpact` and `$redpact-init`. In Claude Code, use
`/redpact:redpact` and `/redpact:redpact-init`; the same task modes apply.
The plugin connects to an already running Redpact instance on port 54321.
It does not install or start the runtime. Start the terminal runtime with
`redpact serve --port 54321`, or launch the desktop app.
MCP Apps approval and credential cards require a compatible host; do not
bypass an unavailable approval UI or silently change the approval policy.

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

Ordinary feature worktrees reuse the fixed verified project configuration and reuse project Docker/Compose
and runtime definitions unchanged. Feature work does not authorize infrastructure
edits, even to fix a failing environment. Resolve gaps with the user as project-level
setup in the intended base-branch checkout; see the dependency guide before any such change.

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

Task-required dependency changes use the one shared project settings file. Read
[Project dependencies](references/dependencies.md), preserve unrelated inputs and
report effects on future executions. There are no worktree overlays or promotion
steps. Execution still uses the selected checkout and fresh runtime resources.
