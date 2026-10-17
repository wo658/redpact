---
title: Settings ownership
description: Shared file ownership, validation and immutable execution inputs.
---

# Settings ownership

The [configuration guide](configuration.md) owns fixed dependency definitions, environment
binding semantics and worked examples. This reference defines where settings live,
how updates are admitted, and how runs capture shared configuration.
Use `redpact settings describe --scope project` against the actual execution checkout for the exact schema;
API schemas are generated from implementation rather than maintained as a copied list.

## Files and resolution

`<rulesRoot>/.redpact/settings.json` is the single fixed project configuration.
`rulesRoot` is the primary directory. `projectRoot` is the selected execution
checkout; Compose, Dockerfile, application and test paths resolve there.
A checkout-local settings file cannot replace the shared configuration.

Tracking preferences remain in `<rulesRoot>/.redpact/tracking.json`. Instance
settings remain in the data directory and own observation, approval and limits.
Mode selection, Integration defaults and dependency overlay files are no longer
read. There is no promotion step or compatibility reader. Existing projects must
use CLI settings patches to adopt the current [configuration contract](configuration.md).

CLI, HTTP, MCP and execution share validation. Unknown fields, duplicate keys, unsafe
paths, conflicting variable writes and source limits are rejected. Accepted runs
capture the shared settings source and digest separately from the execution
checkout's source identity. Later edits affect future executions only.

Compose service references are nonempty strings, without Redpact's lowercase identifier
rule. Compose owns service-name syntax; dependency and Playwright target identifiers
retain their settings schema. See [execution](execution.md#compose-and-source-capture)
for the distinction between settings validation and Compose runtime behavior.

Saving or validating settings never starts code or grants execution approval.
Every execution owns fresh resources; sharing settings never reuses another run's
containers, networks or credentials snapshot.

Runtime snapshot upgrades are separate from authored project configuration; see
[versioned startup migrations](storage.md). The first migration preserves instance
settings and uses captured choices only for legacy environment records.

## CLI settings access

Agents use `redpact settings` for both project and instance settings. Do not directly
read or edit the backing JSON files. This is the supported access contract, not a
filesystem security boundary for trusted local processes. Ordinary application source
and Git operations still use the host's file tools and native `git`.

Select the connected instance explicitly with `--server URL` or `REDPACT_SERVER_URL`.
Use `--scope project --path /absolute/checkout` for shared project settings and
`--scope instance` for global settings. Reads never create a file or connect a project.
The project path selects the execution checkout; its primary checkout still owns the
shared settings. No worktree overlay is introduced.

```sh
redpact settings describe --scope project --path /absolute/checkout --json
redpact settings get --scope project --path /absolute/checkout --pointer /tests --json
redpact settings patch --scope project --path /absolute/checkout \
  --revision RETURNED_REVISION \
  --patch '[{"op":"add","path":"/tests/timeoutMs","value":180000}]' --json
redpact settings validate --scope project --path /absolute/checkout --json
```

`describe` supplies the live schema and ownership information. `get` returns authored
values without inserting defaults, diagnostics, and the whole document's revision even
when `--pointer` selects one subtree. An absent document has `exists: false`,
`revision: null`, and `value: null`. Use `patch --create` instead of `--revision` only
for that absent document. Never retry a stale write automatically: get the current
revision and reconcile the intended change first.

`patch` accepts the JSON Patch operations `add`, `replace`, `remove` and `test`.
Paths use JSON Pointer (`~0` for `~`, `~1` for `/`); the empty pointer selects the root.
Missing parents are not created implicitly. Create a parent and its children in the
same operation array when necessary. Arrays use standard index and append semantics;
`null`, removing a field, and leaving it unchanged are distinct operations.
All operations apply in memory under one required revision or explicit create
precondition. The server validates the complete candidate and project execution plan
before one atomic save. Failed operations, invalid candidates and stale revisions
leave the original unchanged. Untouched values are preserved; whitespace may normalize.
Use `--patch-stdin` instead of `--patch` when values should not appear in shell arguments.

Instance patches cannot change approval policy or Git/GitHub-owned settings, including
by replacing the root. Saving does not execute code, grant approval or update captured
requests. Port changes require restart. Settings responses explicitly declare
`redaction: "none"`: returned values can contain plaintext credentials. Read only the
needed subtree and do not copy private values into chat or public evidence.

Malformed JSON or duplicate keys make `get` return `value: null` with diagnostics;
semantic patches are unavailable. Read its revision and diagnostics,
then use `redpact settings repair --scope project --path /absolute/checkout
--revision RETURNED_REVISION --document-stdin` with a complete valid replacement object
on stdin. The server retains the original backup before replacement. Repair is only
for malformed JSON or duplicate keys; valid JSON with field errors uses `patch`. It does not introduce a
second format, automatic migration or an instruction to bypass the CLI.

Malformed instance JSON can also use repair with `--scope instance`, but the replacement
must explicitly contain `approval: "ask"` and omit `github`. The server does not infer
policy from malformed input. Backups append `.repair-REVISION.bak` to the original
filename with mode 600. Retries reuse a matching original backup; conflicting backups
block repair.

## Editor and display preferences

Project settings edits grouped application/test fields while preserving dependency
configuration. Dependencies owns fixed definitions and environment values. Reads return
source, revision, parsed value and issues; writes validate and atomically replace
with revision conflict detection. Malformed project JSON requires revision-checked `settings repair` through the CLI.
Open drafts are not silently replaced by observed external edits.

`playwright.locale` is Chromium configuration, while `playwright.uiLanguage` is the
declared language of UI labels in Playwright scenarios. The runner supplies the latter
as `REDPACT_UI_LANGUAGE`; application-specific test helpers initialize storage, cookies,
or routes from it before navigation. This makes a single-language application's locator
language explicit without claiming that every application follows browser locale.

Tracking stores `mainBranch`, `hideMerged` and optional `showBranches`. Sidebar
Worktrees controls visibility; Project settings controls the main branch. Browser
preferences such as theme, language, word wrap and hidden project menus are display
choices, not repository configuration. Blocked browser storage retains session use.

Port changes require restart. GitHub CLI and resource preferences affect subsequent
operations. Accepted runs, pending review inputs and existing environments keep
captured values when future defaults change.

Implementation: [settings schema](../app/server/src/core/settings-schema.ts),
[configure guidance](../app/server/src/workflows/configure.ts),
[settings reader](../app/server/src/adapters/settings/json.ts).

Instance settings optionally store `agents.codex.cliPath` and `agents.claude.cliPath` as absolute executable paths. Omit either path for automatic detection. Saving does not execute the CLI; the next plugin check uses the saved value. See [agent plugin updates](installation.md) for supported sources and update behavior. Existing instance settings need no rewrite because these fields are optional.
