---
title: Runtime data and recovery
description: Record identity, artifact ownership and file persistence rules.
---

# Runtime data and recovery

## Source of truth by purpose

Current checkout files and Git own live code. Project settings files own future
configuration. Runtime records own accepted inputs and observed execution history.
Captured settings explain a past run; they are never a second editable configuration
registry. [Settings ownership](settings-reference.md) defines the authored files.

One data directory is one local instance with stable identity and one writer.
Use JSON records and ordinary artifact files, not a generic database abstraction.
This unreleased product supports only each record's current format; it has no
backward readers or compatibility migration. Any development-data reset must be an
explicit action, never a silent recovery strategy.

## Records

| Record | Meaning |
| --- | --- |
| Project | Connected repository/subdirectory or directory identity |
| Worktree | Historical checkout identity and project binding |
| Work item | Captured intent targeting that project/worktree |
| Submission | Immutable exact test/helper source, digest, parsed intent and runner identity |
| Integration run | Submission, accepted target/settings/Git, execution state and results |
| Environment | Selected services/modes, source identity, owned resources and lifecycle |
| Work start | Durable managed-checkout creation input and planned outputs |
| Review | Captured MCP policy, approvals, selection, revision and eventual run linkage |
| Unit run | Captured command/runtime identity, output, terminal and cleanup state |
| Playwright run | Target/scenario results and recorded browser artifacts |
| Merge attempt | Inspected source/target identities, progress and recovery outcome |

A work item can receive multiple submissions; a submission can have multiple runs.
Each new managed execution gets its own environment. Manual environments have no
run IDs and are not execution evidence. IDs and copied target bindings must agree,
but there are no database foreign keys or cross-file transactions.

## Physical ownership

```text
<data-dir>/
├── instance.json, settings.json
├── projects/, worktrees/, work-items/, submissions/
├── work-starts/, reviews/, unit-runs/, merges/
├── runs/<id>/
│   ├── state.json
│   ├── source/, report.json, vitest.config.mjs
│   └── connections.json, stdout.log, stderr.log
├── environments/
│   ├── <id>.json
│   └── <id>/                         # preparation logs and temporary inputs
├── playwright-runs/                         # Playwright records and artifacts
└── .writer.lock
```

The storage adapters define exact current layouts and versions. The diagram shows
ownership, not an export schema. Resource IDs, endpoints and service observations
are embedded environment evidence, not independently managed application records.
Docker/application data exists outside these files; Redpact does not back it up.

## Publication and recovery

Write private temporary files and atomically rename complete records. Immutable
records refuse overwrite. Validate shapes, parent bindings and identity invariants;
report corruption rather than resetting or silently skipping it. A writer lock
records process ownership; never steal a live or unknown owner's lock.

Reservation, run publication and resource creation cross file/process boundaries.
Persist enough operation-specific state to reconcile partial completion. Recovery
must not invent execution evidence, retarget accepted inputs or replay uncertain
starts. Pending approvals survive restart; uncertain starting requests become
interrupted and require inspection. Terminal verdicts remain stable during cleanup.

Stopping an environment deletes owned runtime resources and captured source/runtime
files while retaining metadata and logs. Unit removes its per-run image; Playwright
removes its capture container while retaining its shared runner image. Worktree disappearance preserves historical results. Temporary Compose
build images are removed with their environments; Docker build caches and explicitly
named project images are not pruned. No general automatic evidence archival/deletion policy is implied;
manual deletion of a referenced record can break its dependants.

## Private values and evidence

Project secret values live in private instance storage and override server environment
fallbacks. Explicit blank values disable fallback. Public records expose references
and availability; `connections.json` contains mapped addresses, not credentials.
Review capabilities and credential-input tokens must not enter model-visible content.
Private source, images or transformed program output may still contain sensitive
information; runtime evidence is local data, not an automatic public export.

Implementation: [storage adapters](../app/server/src/adapters/storage),
[record contracts](../app/server/src/core/types/contracts.ts),
[review storage](../app/server/src/adapters/storage/reviews.ts),
[capture storage](../app/server/src/adapters/storage/captures.ts).
