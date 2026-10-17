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
├── work-starts/, reviews/, execution-reviews/, unit-runs/, merges/
├── runs/<id>/
│   ├── state.json
│   ├── source/, report.json, vitest.config.mjs
│   └── connections.json, stdout.log, stderr.log
├── environments/
│   ├── <id>.json
│   └── <id>/                         # preparation logs and temporary inputs
├── playwright-runs/                         # Playwright records and artifacts
├── .writer.guard                          # permanent OS lock inode
└── .writer.lock                           # current process ownership
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

The common CLI, desktop and App runtime holds an OS advisory lock on the permanent
`.writer.guard` file throughout startup, execution and shutdown. The guard serializes
owner recovery and is released by the kernel when a process dies, including forced
termination. Never delete or replace this guard file, even when it appears empty.
A remaining guard file does not mean the instance is running.

Under that guard, startup automatically recovers `.writer.lock` only when its valid
PID metadata identifies a process the OS reports as absent (`ESRCH`). The old owner
file is preserved as `.writer.lock.stale-<id>` before acquisition; records, migrations,
settings and evidence remain unchanged. Owner metadata is published atomically so
interrupted initialization does not expose a partial new owner. Concurrent starters
admit one writer; others report a locked instance and can retry after it stops.
Live PIDs, reused PIDs, permission-denied probes and malformed/unknown owners block
startup without deleting the marker. For those cases, inspect the owner and stop it
before manual recovery. Automatic recovery assumes a local filesystem and one host
PID namespace; do not share an instance directory between machines or containers
with separate PID namespaces. These operational lock files do not change record
formats or require a data reset or migration.

Shutdown stops accepting connections and attempts every cleanup in order, reporting
all failures. Repeated requests share the same cleanup. The writer lock is released
only after successful cleanup; if cleanup fails, the process terminates with a
nonzero status and holds ownership until its final synchronous exit cleanup. This
prevents an unfinished writer from overlapping a replacement. Forced termination
still relies on startup recovery; no signal handler can handle `SIGKILL` or power loss.

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

Unit and Playwright Ask requests use the additive `execution-reviews/<id>.json`
record family at `version: 1`. Each record retains its specification, settings/input
digests, captured policy, revision, UI capability and eventual execution linkage.
Existing Integration `reviews/` and execution records keep their formats and original
bytes; this additional family does not transform old records. Future format changes
must follow the ordered migration rules above. Unknown versions or corrupt reviews
block startup instead of being reset.

Pending Unit/Playwright reviews remain actionable after restart. A `starting` review
interrupted during admission becomes `interrupted` and is never replayed. Failure to
save the final review linkage after a run starts also preserves uncertain admission;
inspect execution history before requesting again. Cancellation retains reviews and
evidence. Approval state and execution verdict remain separate.

## Environment values and evidence

Environment strings remain plaintext in the shared settings and captured settings/source
records. New executions do not create private-secrets files or read server environment
fallbacks. See [environment values](configuration.md) for masking and plaintext limits.
Review capabilities must not enter model-visible content. Images and transformed output
may still contain sensitive information; evidence is local data, not a public export.

Migration `002-flat-environment-values` converts historical environment records to string
values. It unwraps literal bindings, derives old service host/port/URL bindings using the
original internal DNS convention, and resolves secret references only from the saved
`private-secrets/environment-<id>.json` snapshot. It never substitutes current project or
server values. Missing or invalid captured values block startup without rewriting records;
restore the matching captured snapshot from an instance backup before retrying. Original
records are backed up under the first pending migration. Captured source, digests and
historical private files are preserved; ordinary execution no longer reads those private
files. Authored settings require manual conversion under [configuration](configuration.md).

Implementation: [storage adapters](../app/server/src/adapters/storage),
[record contracts](../app/server/src/core/types/contracts.ts),
[review storage](../app/server/src/adapters/storage/reviews.ts),
[capture storage](../app/server/src/adapters/storage/captures.ts).

Migration implementation: [workflow](../app/server/src/workflows/runtime-migrations.ts),
[file adapter](../app/server/src/adapters/storage/migrations.ts).

Migration `003-execution-selection` adds an explicit unknown (`null`) selection to
historical submissions, Unit/Playwright runs and their execution reviews. It preserves
original bytes in the existing ordered-migration backups, validates records before
replacement and retries interrupted changes. It never guesses historical file sets or
changes verdicts. New records capture the selection contract in [execution](execution.md).

Runtime lifecycle diagnostics are appended synchronously to `runtime-lifecycle.jsonl`
in the instance data directory, independently of the parent connection. Entries include
PID/time, startup requests/completion/failure, shutdown reasons (`manual`, `update`,
`parent_disconnect`, `SIGINT`, `SIGTERM`, `server_error`), cleanup errors, writer release
and stale-owner recovery. The installed CLI supervisor also records child PID, exit code
and signal, including forced child termination while the supervisor survives.
SIGINT/SIGTERM received by the CLI remain the shutdown reason in both supervisor
and child records. Shutdown waits for admitted HTTP handlers before releasing writer
ownership. SIGKILL of
both processes cannot produce a final entry. Logs are retained without automatic rotation;
archive them only while the instance is stopped. A live or reused PID is never reclaimed;
invalid metadata and failed liveness probes report distinct refusal reasons. These logs
provide future diagnosis; they do not establish the original cause of earlier shutdowns.

Migration `004-manual-environment-scope` records `manualScope: "main"` on existing
manual environments because the preceding contract only created them from the configured
main checkout. Test records and historical evidence remain unchanged. New manual records
capture `main` or `worktree` when started; later branch changes never retarget their port
policy. Original bytes and interrupted retry follow the ordered migration rules above.
Manual environment source and generated `runtime/` files are removed only after explicit
successful teardown; server shutdown preserves their ownership for reconnection.

Before removing containers for an older unlabeled build image, cleanup atomically writes
`environments/<id>/runtime/legacy-image-ownership.json` from the captured implicit build
and currently observed owned containers. This generated operation artifact binds each
tag to its immutable image ID, environment, instance owner and Docker runtime; it does
not change historical records. Partial failures retain it for retry after containers are
gone. Missing proof requires fresh observed ownership; corrupt or mismatched proof and
replaced images never authorize deletion. Successful teardown removes the artifact.
