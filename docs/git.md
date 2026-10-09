---
title: Checkout identity and Git
description: Host-owned Git work and read-only execution identity.
---

# Checkout identity and Git

The host agent owns worktree creation, branches, staging, commits, merges and pull
requests. Redpact does not provide a Git management interface or mutation API.
Use the host's native Git tools within the user's authorized scope.

## Existing checkout routing

Redpact observes configured roots and native Git worktree registrations. A repository
subdirectory keeps its relative application root when resolving linked worktrees.
Directory projects remain bound to their configured directory. Read-only discovery
never creates a checkout, rewrites project settings or executes application code.

Execution uses the explicit existing checkout. The shared primary checkout owns
`.redpact/settings.json`; Compose, Dockerfiles, application source and tests resolve
in the execution checkout. See [configuration](configuration.md).

Native Git reads establish source identity and comparisons needed for execution.
A run's captured Git identity is historical evidence, not permission to mutate the
repository. Missing or moved checkouts can retain history while becoming unavailable
for new execution; do not silently substitute another checkout.

## Review and cleanup

Use the returned execution identity and its review link. Worktree-bound history
shows attempts for the recorded checkout, including retained evidence after that
checkout disappears. Source freshness remains unknown unless the relevant live
inputs were compared.

Commit, PR and merge decisions remain in the host conversation. Execution approval
and passing tests do not grant those permissions. Removing a worktree must preserve
needed files and historical evidence; follow the repository's worktree policy.
Runtime resource cleanup is separate from Git cleanup. See [execution](execution.md)
and [storage](storage.md) for ownership and recovery.
