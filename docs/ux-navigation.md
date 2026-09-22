---
title: UX navigation
description: The current application page, tab and action hierarchy.
---

# UX navigation

This file tree describes user navigation, not repository directories or URL paths.
Labels use the English UI vocabulary; the application also localizes them.

Legend: `[page]` opens a main view, `[tab]` switches within a view,
`[action]` performs an operation, `[dialog]` opens an overlay, and `[section]`
groups content or controls. Unmarked leaves describe visible content.

## Screen tree

```text
Redpact
├── Connection / startup
│   ├── Connecting to local Redpact
│   ├── Local server unavailable
│   │   └── Retry connection [action]
│   └── No connected project
│       └── Open project folder [action]
│
├── Application header
│   ├── New tab [action]
│   └── Open workspace tabs [tab]
│       ├── Connected project [tab]
│       └── Selected worktree [tab]
│
├── Sidebar
│   ├── Project switcher
│   │   ├── Select connected project [action]
│   │   └── Connect project [action]
│   ├── Project display options
│   │   ├── Show / hide each available project menu item [action]
│   │   └── Show all [action]
│   │
│   ├── Selected project
│   │   ├── Container [page]
│   │   │   ├── Target checkout and input freshness
│   │   │   ├── Manual environment status and resources
│   │   │   ├── Application links / published endpoints
│   │   │   └── Start / Restart / Stop [action]
│   │   │
│   │   ├── Tests [page]
│   │   │   ├── Unit [tab]
│   │   │   │   ├── Unit test file list
│   │   │   │   ├── Code [tab]
│   │   │   │   ├── Command results [tab]
│   │   │   │   │   └── Command history, status, stdout and stderr
│   │   │   │   └── Run Tests / Cancel command [action]
│   │   │   ├── Integration [tab]
│   │   │   │   ├── Integration test file list
│   │   │   │   ├── Code [tab]
│   │   │   │   ├── Execution results [tab]
│   │   │   │   │   └── Recorded cases, steps and verdicts
│   │   │   │   ├── Integration defaults [dialog]
│   │   │   │   │   └── Root services and dependency mode selection
│   │   │   │   └── Run Tests [action]
│   │   │   └── Playwright [tab]
│   │   │       ├── Screenshots [tab]
│   │   │       │   └── Selected capture file
│   │   │       │       ├── Preview [tab]
│   │   │       │       └── Test Code [tab]
│   │   │       ├── Tests [tab]
│   │   │       │   └── Selected functional test file
│   │   │       │       ├── Code [tab]
│   │   │       │       └── Execution results [tab]
│   │   │       ├── Runs [tab]
│   │   │       │   └── Selected recorded execution
│   │   │       │       ├── Execution results [tab]
│   │   │       │       └── Test Code [tab]
│   │   │       └── Playwright execution controls [action]
│   │   │
│   │   ├── File Viewer [page]
│   │   │   └── File tree → selected file source or image preview
│   │   │       └── SVG Preview / Source [tabs]
│   │   ├── Git Graph [page; Git projects]
│   │   │   ├── Branch filter, remote visibility and loaded-commit search
│   │   │   ├── Commit history → selected commit → changed file → diff
│   │   │   └── Fetch [action]
│   │   ├── Dependencies [page]
│   │   │   ├── Overview [tab]
│   │   │   │   └── Service relationships → selected service details
│   │   │   ├── Configuration [tab]
│   │   │   │   └── Selected dependency → configured mode
│   │   │   │       ├── Per-environment / Shared local / Remote connection / Mock
│   │   │   │       ├── Additional services
│   │   │   │       └── Environment overrides and secret value inputs
│   │   │   └── Dependency modes and environment overrides [dialog]
│   │   └── Project settings [page]
│   │       ├── General [section]
│   │       │   └── Main branch selection for Git projects
│   │       ├── Application [section]
│   │       │   └── Compose files
│   │       ├── Unit Test [section]
│   │       │   └── Dockerfile, command, working directory and file patterns
│   │       ├── Integration Test [section]
│   │       │   └── Directory, test/hook timeout and test environment
│   │       ├── Playwright [section]
│   │       │   └── Application connection, scenarios, targets and browser options
│   │       └── Save settings / Reload or discard conflicting draft [action]
│   │
│   ├── Worktrees
│   │   ├── Worktree display options
│   │   │   ├── Worktrees only / Include local branches
│   │   │   └── Hide merged worktrees
│   │   ├── Selected live worktree [page]
│   │   │   ├── Diff [tab; conditional]
│   │   │   │   └── Changed file list → selected file diff
│   │   │   ├── Playwright [tab; conditional]
│   │   │   │   └── Capture file list → recorded PNG checkpoints
│   │   │   │       └── Desktop / Mobile evidence selection
│   │   │   ├── Unit Test [tab; conditional]
│   │   │   │   ├── Changed unit test files → Code / Command results
│   │   │   │   └── Run Tests / Cancel command [action]
│   │   │   ├── Integration Test [tab; conditional]
│   │   │   │   ├── Changed integration files → Code / Execution results
│   │   │   │   └── Run Tests [action; latest submission]
│   │   │   ├── Log [tab; conditional]
│   │   │   │   └── Execution history and copyable execution details
│   │   │   ├── Environment [tab; conditional]
│   │   │   │   ├── Worktree service and dependency mode selection
│   │   │   │   └── Recorded environment status, resources and cleanup controls
│   │   │   └── Git toolbar actions
│   │   │       ├── Uncommitted [dialog; conditional when changes exist]
│   │   │       │   ├── File diffs
│   │   │       │   ├── Commit all changes [action]
│   │   │       │   └── Discard all listed changes [confirmation dialog]
│   │   │       ├── Merge [dialog / action]
│   │   │       └── Pull request publication [dialog / action]
│   │   └── Selected branch without a live checkout [page; optional]
│   │       └── Committed changed files → selected file diff
│   │
│   ├── GitHub repository [link; sidebar footer icon]
│   ├── Star on GitHub [link; sidebar footer icon]
│   ├── Update [action; newer desktop/npm version only]
│   └── Settings [page; global, sidebar footer icon]
│       ├── Updates [section]
│       │   └── Check for updates [action; no installation]
│       ├── Preferences [section]
│       │   ├── Theme: Light / Dark / System
│       │   ├── Word wrap
│       │   └── Language
│       ├── Integrations [section]
│       │   └── GitHub connection check
│       ├── Automation [section]
│       │   └── MCP approval: Auto / Ask first
│       └── Instance configuration [section]
│           ├── Managed environment concurrency
│           ├── Test memory and execution time limits
│           ├── Server port
│           ├── Observed project directories
│           ├── GitHub CLI path
│           └── Save settings [action]
```

## Navigation behavior

- The sidebar footer places Settings, GitHub, Star and the available Update action in
  one compact row with accessible names and tooltips. Update has a text label; the
  remaining shortcuts use icons. Settings
  keeps its selected state. GitHub and Star open the public repository in a new
  browser tab or the desktop system browser; users give Stars on GitHub.

- Project display options start with every available item visible. Hiding an item
  preserves the current page and active work. Worktrees and global Settings remain
  accessible. Visibility is remembered per project in browser storage.
- Worktree review hides confirmed-empty tabs. Errors, diagnostics, active execution
  and cleanup remain reachable. If the selected tab disappears, the first available
  tab opens; no available content produces one empty state.
- Worktree tab availability uses `GET /api/worktrees/:id/review-content`: one
  metadata query sharing a changed-path scan, without source bodies, application
  fingerprints or Docker calls. Tabs first appear when the availability response
  arrives; background invalidations preserve the displayed navigation until the
  next response. Detail panels fetch their content when opened.
  Completed submission history alone does not keep Integration visible when its
  changed-file list is empty; active runs and diagnostics remain reachable, and
  retained execution history remains in Log.
- Project Unit and Integration browse the full primary-checkout catalog. Worktree
  tabs focus on changed files. Unit executes its full configured command; worktree
  Integration executes the latest submission rather than the selected source file.
- Project Playwright records remain browsable without a live primary checkout.
  Project Unit and Integration require that checkout. Branch-only review exposes
  committed diffs without worktree execution controls.
- Playwright lists current worktree capture drafts and changed project capture files
  before execution as well. Desktop/Mobile filters images from the latest matching
  execution using recorded viewport metadata; it does not hide source files.
  Functional test results are available through Tests and execution history.
- Container is a manually retained application environment. Its service/dependency
  selection comes from project Integration defaults; it is separate from recorded
  test execution evidence.
- Browser desktop keeps the sidebar open and the header exposes only the open-workspace
  strip rather than a sidebar toggle, page title or history controls. Compact mobile
  screens retain the sidebar trigger; the native macOS desktop keeps its sidebar control.
  Workspace tabs use a fixed width, left-aligned icons and truncated labels with subtle outlines.
  The header plus button opens another project tab on the current project’s default review
  screen without replacing existing tabs. Each open tab retains its sidebar and current view state when switching tabs, including
  expanded folders, selected files, nested test tabs, drafts and scroll positions. Hidden
  tabs suspend subscriptions and refresh when reactivated. Closing a tab releases its state. New tabs are
  session-only; reloading resets the strip. Selecting a project opens or activates its project tab;
  selecting a worktree adds a worktree tab. Closing either tab only removes it from
  the strip and never stops an execution or disconnects a project.
- Settings sections and actions can depend on available API capabilities. The MCP
  approval preference shown here does not imply a separate approval-inbox page.

See [frontend conventions](frontend.md) for composition rules and [execution](execution.md) for lifecycle semantics.

See [runtime updates](installation.md) for Update visibility, manual checking and installation conditions.
