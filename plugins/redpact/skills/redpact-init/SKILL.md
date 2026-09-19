---
name: redpact-init
description: Initialize a project for local Redpact by configuring observation, runnable application containers with verified host access, unit commands, and managed test capabilities as needed. Register dependency modes only after verifying worktree usability and resolving required user inputs. Use for Redpact project setup; feature development and review belong to redpact.
---

# Redpact Init

Configure the target application for the connected local Redpact service. Resolve
its absolute path from the request and workspace; the target need not be the
Redpact repository. Keep the installed service independent from the application.

Read the [configuration guide](references/configuration.md) and follow its setup,
observation readback, live discovery, validation and completion requirements.
Before authoring, follow [schema-complete initialization](references/configuration.md#schema-complete-initialization):
check the connected runtime schema, populate every applicable supported field with
a valid default or inspected value, and diagnose unsupported keys before saving.
Plugin installation alone does not initialize a project or update the runtime.
For a runnable web application or server, ordinary init includes a usable Container
baseline even when integration tests or dependency modes have not been requested.
Follow [application Container setup](references/configuration.md#application-container-baseline).
Respect explicit draft-only/unit-only scope and projects without a runnable server;
do not create placeholder services for them.
Load the [dependency guide](../redpact/references/dependencies.md) only when application
services, dependency modes or connection inputs need setup. Present configured topology
as a Mermaid v12 flowchart following that guide. Preserve unrelated settings.

Perform Git project setup directly in the intended base-branch checkout; read the
[init checkout lifecycle](references/configuration.md#init-checkout-lifecycle).
Implement Mock adapters, environment wiring, Dockerfiles and Compose there.
Ordinary feature worktrees only select verified modes. The live settings contract
still uses the shared primary rulesRoot, not a checkout-local settings override.
Do not claim init complete until the setup is committed on the intended base
and a fresh worktree runs the agreed baseline selection without infrastructure edits.
Follow the dependency guide's ordered init discussion: ask about existing Cloud or
always-running shared-local services first, then agree on a minimum baseline using
Isolated where feasible and runnable Mock implementations otherwise. Ask about
additional dependencies or alternative modes per app after presenting that baseline.
Request required private keys only for selected connections. Reuse explicit choices
and baseline implementation authorization without repeated per-dependency questions. Init authorizes the scoped local setup commit after verification, not unrelated
features, remote publication or an unrequested merge.
Application Container setup and dependency registration
include bounded temporary execution to verify host access and the proposed mode; follow
the dependency guide before advertising it as available. Ask for missing connection
facts and use secure input for credentials. Do not run unrelated tests, unit commands,
persistent application/dev/preview processes or an unrequested Playwright capture.
Readiness checks are required; screenshot review is not an init completion gate. Report authored/reused
files, verified project and checkout paths, actual validation results and deferred
runtime checks; configuration validation proves neither readiness nor approval.
