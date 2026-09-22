---
title: Architecture
description: Current component boundaries and the reasons behind them.
---

# Architecture

Redpact is a local development review tool. It connects project checkouts, captures
submitted test intent and source, executes tests, and presents observed evidence.
Test success, configuration validity, application freshness and human acceptance
are different facts. A result never implies the others.

## Components

```text
Web / Tauri viewer ── HTTP ─┐
                           ├── workflows (Imperative Shell) ── core (pure decisions)
Agent / MCP Apps ─── MCP ───┤                 │
Startup / observation ──────┘                 └── adapters ── Git / files / runtimes

Documentation site ── docs/*.md
```

| Source | Responsibility |
| --- | --- |
| `app/server/src/interfaces` | Hono HTTP routes and MCP transport, request validation and response shaping |
| `app/server/src/workflows` | All application use cases, including single-feature queries, execution, approval, observation, recovery and termination |
| `app/server/src/core` | Pure policies, calculations, validation schemas and formatting; explicit input data produces decisions or values |
| `app/server/src/core/types` | Type-only data and dependency contracts; no runtime exports or barrel |
| `app/server/src/adapters` | Files, native Git, source parsing, processes, Docker and Playwright |
| `app/server/src/main.ts` | Concrete dependency wiring and process lifecycle |
| `app/web` | Connected React viewer and separately bundled MCP cards |
| `app/desktop` | Tauri desktop host for the local runtime |
| Separate `redpact-web` repository | Website and documentation renderer; reads this repository’s `docs/` directly |

## Boundary rules

The server uses Functional Core, Imperative Shell. HTTP, MCP and internal application
triggers enter workflows for use cases. Transport code may use pure schemas and
formatters directly, but does not reach adapters to implement application behavior.
The workflow directory includes feature-level service factories as well as operations
that combine several services; an existing `createXxx` name does not make it Core.

Workflows gather facts, call pure policies when needed, and perform effects through
injected dependencies. They own sequencing, cancellation, locking, recovery and
cleanup. A simple read can return an adapter result directly: do not create a Core
function that only forwards data, or require every workflow to call Core. Use the
same use-case implementation from HTTP and MCP instead of duplicating behavior.

Core receives data, not storage, runner or other effectful service capabilities. It
must not import workflows, adapters or interfaces, including through type imports.
Time, random identifiers and external observations are supplied by the Shell when a
policy needs them. Local calculation and deterministic hashing are allowed; Core
must not change caller-owned data or access ambient external state. Schemas and
formatters remain reusable by transports and adapters. Adapters never import
workflows or interfaces, and workflows never import transport implementations.

Extract a policy when it expresses a meaningful rule, such as verdict precedence,
review-tab availability or container selection. Keep related rules together rather
than extracting every assignment. Straight-line I/O and its control flow belong in
the Shell. Run admission and terminal verdicts remain distinct from Environment
reservations, resource state and stop admission. The stop workflow blocks admission,
confirms cancellation, then removes owned resources. Cleanup failure remains separate
from a test verdict. Preserve locking and observation order when moving decisions:
a pure decision does not make a read/check/write sequence atomic.

The architecture tests check layer imports, server dependency cycles (including type
imports), type-only contracts, reviewed Core external imports and common ambient
effects such as clocks, randomness and process environment access. These are static
regression guards, not proof of purity; injected callbacks, input mutation and
library behavior still require review and focused behavior tests.

Use TypeScript, Hono and ordinary functions. Avoid controller classes, DI containers,
generic storage engines and speculative wrappers. Reuse existing libraries and Node
primitives. There is no generic event bus, command interpreter or transaction engine
between record files.

## Current implementation choices

- Runtime storage uses JSON and artifact files with one writer per instance. There
  is no SQLite/Drizzle runtime or backward-format migration layer.
- Native Git owns status and exclude semantics for all index formats, patches and
  mutations. Repository discovery and supported blob reads retain isomorphic-git.
- Parcel file observation drives scoped invalidations; observation never runs tests.
- ts-morph extracts static test intent from isolated submitted-file symbols without
  loading TypeScript standard-library declarations. Vitest records actual integration results.
  Static parsing does not prove assertion execution or full import coverage.
- Testcontainers owns container startup. Redpact owns input capture, admission,
  health observations, resource identities, cancellation and cleanup.
- Unit, Integration Vitest and Playwright execute in temporary containers. Integration
  and Playwright join a per-execution network with service-name access to the application.
- MCP Apps implement request approval and credential inputs. Their capabilities
  rely on the client keeping App-only metadata out of model context; this does not
  establish code-review acceptance or isolation from trusted local processes.
- GitHub publication reuses native Git and authenticated `gh`; GitHub owns PR identity.

Standalone npm installs use a CLI parent to stop the owned server before delegating package replacement to its detected npm/pnpm owner. Native desktop keeps Tauri ownership. Both expose update availability to the viewer; SemVer comparison uses the existing node-semver implementation. See [runtime updates](installation.md) for installation limits and restart behavior.

## Scope and evidence

Live Git checkout discovery and immutable execution identities are separate. A
missing checkout can keep historical results while becoming unavailable for new
execution. Shared fixed configuration is described in
[settings ownership](settings-reference.md), not copied into worktree identity.

Use [execution](execution.md), [storage](storage.md), [interfaces](interfaces.md),
[Git operations](git.md) and [frontend conventions](frontend.md) for their contracts.
Current limitations belong beside the affected feature. Historical proposals,
superseded decisions, test counts and merge journals remain in Git history, not a
second current-state document.

Implementation: [composition](../app/server/src/main.ts),
[core contracts](../app/server/src/core/types/services.ts),
[architecture tests](../app/server/test/architecture.test.ts).
