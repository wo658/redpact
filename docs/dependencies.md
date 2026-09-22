---
title: Dependencies and worktrees
description: One fixed project configuration with separate worktree execution resources.
---

# Dependencies and worktrees

An application may use an isolated PostgreSQL database, a managed payment mock, shared
local search and a remote API together. Define that fixed topology once in the primary
checkout's `.redpact/settings.json`; all linked worktrees use it. Dependencies describe
integrated services, not npm packages installed by Docker builds.

| Kind | Provisioning and cleanup |
| --- | --- |
| `isolated` | Compose starts the declared dependency services for each execution |
| `mock` | Compose starts an implemented substitute, or bindings enable an in-process mock |
| `shared-local` | Existing host infrastructure; Redpact never starts or removes it |
| `remote` | Existing remote endpoint; Redpact never starts or removes it |

A kind does not install software or implement a mock. Declare only working connections.
Each dependency has one fixed definition; there are no selectable modes or recommendations.
The primary settings file supplies root services, dependency services and bindings.
Compose prerequisites extend that service set. Binding a variable does not start its target.

## Shared configuration, independent execution

`rulesRoot` identifies the shared settings location. Compose, Dockerfile, app and test
paths resolve in the executing checkout, so a feature uses its own code. Each execution
owns fresh containers and networks; configuration sharing does not permit environment
reuse. Worktree selection files and dependency overlays do not affect execution.

Validate with `configure` using the actual checkout. Validation does not start services,
prove connectivity or grant approval. Execution captures settings, prepares resources,
checks readiness, runs tests and removes only its owned resources. Independently operated
shared-local and remote services remain alive; tests must isolate their fixture data.

Application bindings and the common runner environment are explicit and separate. Both
Integration and Playwright receive `tests.env` and the same connection-file format.
See [configuration](configuration.md) for declarations and [runner connectivity](execution.md#runner-connectivity)
for DNS, shared-host reachability and browser origins.

## Ask your agent

> Inspect the application's database, cache and external API connections. Configure one
> fixed Redpact topology shared by all worktrees. Verify each connection from its actual
> consumer and distinguish configuration validation from runtime evidence.

Continue with [project setup](first-project.md) or [review your first change](review-workflow.md).
