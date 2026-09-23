---
title: Settings ownership
description: Shared file ownership, validation and immutable execution inputs.
---

# Settings ownership

The [configuration guide](configuration.md) owns fixed dependency definitions, environment
binding semantics and worked examples. This reference defines where settings live,
how updates are admitted, and how runs capture shared configuration.
Use `configure describe` against the actual execution checkout for the exact schema;
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
manually author the current [configuration contract](configuration.md).

HTTP, MCP and execution share validation. Unknown fields, duplicate keys, unsafe
paths, conflicting variable writes and source limits are rejected. Accepted runs
capture the shared settings source and digest separately from the execution
checkout's source identity. Later edits affect future executions only.

Saving or validating settings never starts code or grants execution approval.
Every execution owns fresh resources; sharing settings never reuses another run's
containers, networks or credentials snapshot.

Runtime snapshot upgrades are separate from authored project configuration; see
[versioned startup migrations](storage.md). The first migration preserves instance
settings and uses captured choices only for legacy environment records.

## Editor and display preferences

Project settings edits grouped application/test fields while preserving dependency
configuration. Dependencies owns fixed definitions and environment values. Reads return
source, revision, parsed value and issues; writes validate and atomically replace
with revision conflict detection. Invalid JSON requires repairing the named file.
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
