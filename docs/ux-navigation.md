---
title: Review workspace navigation
description: Current work, execution history and focused evidence review, with advanced controls kept secondary.
---

# Review workspace navigation

The viewer has one selected project and checkout. The coding host owns task tabs,
file editing and Git mutations; Redpact does not add another workspace-tab manager,
File Viewer or Git Graph. Requests normally begin in chat through
[MCP](interfaces.md). Opening any review view is read-only.

## Screen tree

```text
Redpact review workspace
├── Connection / startup
│   ├── Connection status and retry
│   └── Connect project / Manage projects
├── Project selector
│   ├── Select connected project
│   └── Connect / manage retained projects
├── Current work [default page]
│   ├── Checkout selector
│   ├── Configuration diagnostics and approval policy
│   ├── Pending execution approvals → Review request
│   ├── In-progress executions → Execution review
│   ├── Cleanup requiring attention → Execution review
│   ├── Recent evidence → Execution review
│   └── Copy checkout context for chat
├── Execution history [page]
│   ├── Checkout selector
│   ├── Unit / Integration / Playwright records
│   ├── Older / newest execution pagination
│   └── Execution review [detail]
│       ├── Execution and checkout identity
│       ├── Outcome, cleanup and observed failures
│       ├── Captured request details and explicit approval when pending
│       ├── Recorded output / source / case results / images / attachments
│       ├── Cancel or retry supported cleanup
│       └── Copy execution context for chat
├── Tools [collapsed by default]
│   ├── Container: separate manual environment and recovery
│   ├── Tests: Unit / Integration / Playwright catalogs and explicit execution
│   ├── Dependencies: fixed definitions and environment bindings
│   ├── Project settings: application and test configuration
│   └── Worktrees: read-only changes and existing evidence surfaces
│       ├── Diff and applicable test / Playwright / Log / Environment tabs
│       └── Optional branch-only committed comparison
└── Settings
    ├── Theme / language / word wrap
    ├── Execution approval policy
    └── Instance configuration
```

## Target and history

Project selection opens Current work. Checkout selection keeps the target explicit
for status, history and evidence; an execution review always displays the recorded
checkout even if current selection differs. Project Tests remains the primary-checkout
catalog. Its run controls do not silently change to another selected checkout.

Sidebar destinations and checkout changes use browser history. Native Back/Forward
uses the same History API. Reload restores the URL destination; drafts, file selection
and scroll position are not a persistent workspace. Repeated navigation to the same
location does not create a duplicate history entry. Mobile navigation closes its
sidebar after selecting a destination.

`get_review_context` returns a relative `reviewPath` for the connected viewer, such as
`/?project=<projectId>&page=review&kind=unit&id=<executionId>&worktree=<worktreeId>`.
Use it with that instance's origin. An unavailable or mismatched record shows a
diagnostic; a viewer link is not a new execution or proof of freshness.
Retained executions without a project binding, or whose project is no longer listed,
open directly by execution kind and ID without selecting or connecting another project.

## Progressive detail

Current work surfaces pending approvals, active work and unfinished cleanup separately
from recent results. Historical paging does not hide older active or cleanup records.
Compact MCP summaries bound their returned details; open recorded evidence for full
available context. A failed refresh labels displayed evidence as potentially stale.

Tools starts collapsed and remembers an explicit display preference when browser
storage is available. A direct advanced destination reveals its navigation. Worktree
review keeps read-only comparisons and recorded evidence; commits, discards, merges
and PR publication belong to the host agent. Backend Git workflows retain their
existing contracts; see [Git operations](git.md).

The viewer omits promotional footer links, app-owned tabs, GitHub connection controls
and agent-plugin update panels. Runtime installation and host plugin management remain
with the selected installation method; see [installation](installation.md).

## Evidence and decisions

A result, its source freshness and human acceptance remain independent facts. Unknown
freshness is displayed explicitly. Approval authorizes only the reviewed execution;
it does not record acceptance of code or permit a merge. Ask requests can be approved
through a supported App card or an explicit connected viewer action. The model cannot
approve by returning text or by invoking a hidden UI action.

Execution detail uses captured Integration and Playwright source, never current source
as a substitute. Unit retains whole-command output. Cleanup failure stays actionable
alongside the test verdict. Retained evidence remains available after a checkout is
removed. See [results](results.md), [execution](execution.md) and
[frontend conventions](frontend.md) for detailed behavior.
