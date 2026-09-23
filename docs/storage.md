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
Ordinary readers support the current format. Explicit, ordered Umzug startup migrations
upgrade supported older runtime records before readers and recovery run. Unknown formats
are errors, not permission to reset data. Any reset must be an explicit action.

## Records

Project records retain the display name and optional `disconnectedAt` timestamp
alongside immutable identity/location. Disconnection never cascades into evidence,
secret, worktree or source-file deletion. Reconnection clears that timestamp on the
same record; see [project management](git.md).

| Record | Meaning |
| --- | --- |
| Project | Connected repository/subdirectory or directory identity |
| Worktree | Historical checkout identity and project binding |
| Work item | Captured intent targeting that project/worktree |
| Submission | Immutable exact test/helper source, digest, parsed intent and runner identity |
| Integration run | Submission, accepted target/settings/Git, execution state and results |
| Environment | Fixed services/dependency kinds, source identity, owned resources and lifecycle |
| Work start | Durable managed-checkout creation input and planned outputs |
| Review | Captured MCP policy, approvals, captured configuration, revision and eventual run linkage |
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
├── .migrations/completed.json           # ordered Umzug migration names
├── .migrations/backups/<migration>/      # original bytes of changed records
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

## Versioned startup migrations

Startup acquires the existing instance writer lock, checks `.migrations/completed.json`,
and runs pending Umzug migrations before loading instance settings, recovering resources
or accepting HTTP/MCP requests. Ordered migration names version the instance layout
independently of product SemVer and the record envelope's `version: 1`. Keep completed
names as a prefix of the application's migration list. Unknown, duplicate, reordered or
malformed history blocks startup without clearing it. A missing history starts at the
supported pre-migration layout, including an empty installation.

`001-fixed-environment-settings` converts legacy environment `specification.dependencies`
from `modes` to fixed definitions using each environment's captured `selection.select`.
It fills missing root `services` from captured `selection.services`. It never guesses
from a recommendation. Missing selections, unsupported shapes and invalid records
block startup with the record path. Current-format records are left byte-for-byte unchanged.
The migration preserves IDs, timestamps, digests, resolved execution inputs and captured
source. The original specification, including unused modes and assessments, remains in
the exact-byte backup; the active record contains the selected fixed definition.

Umzug applies pending version-specific transformations in memory; their input contracts
are frozen independently of the current authoring schema. Validate the final current
format only after all pending transformations. All inputs are checked before replacements
begin. Each changed file gets
an exclusive, durable original backup before an atomic replacement. Completion history
is also replaced atomically, only after all pending transformations and replacements succeed. A restart after interruption
reuses backups under the first pending migration and finishes pending work; it rejects a record that differs from both its
backup and expected converted result. Files are not a multi-file transaction: interruption
can leave a partially converted set, with originals retained and completion still pending.
This is process-interruption recovery, not a general filesystem disaster-recovery guarantee.

Backups cover changed runtime records only, not the whole instance, Docker volumes or
project files. They are not pruned automatically. Keep a complete instance backup before
an upgrade if rollback is required. There is no automatic downgrade or `down` command;
restore the matching complete data backup with its application while stopped. Old apps
predating this mechanism do not recognize its history and must not open upgraded data.
Do not delete the journal or writer lock to force a downgrade.

Authored project `.redpact/settings.json` still has the single fixed contract in
[configuration](configuration.md); startup does not rewrite repositories or select
infrastructure for users. Instance `settings.json` is currently unchanged by the first
migration. Future persisted-settings changes must add an explicit ordered migration
with old input validation, original preservation and interrupted-upgrade tests, rather
than coupling historical snapshots to a new authoring schema without an upgrade path.

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

Migration implementation: [workflow](../app/server/src/workflows/runtime-migrations.ts),
[file adapter](../app/server/src/adapters/storage/migrations.ts).
