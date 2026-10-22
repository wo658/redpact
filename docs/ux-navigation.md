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

This hierarchy applies to the full browser and Global App Page. Chat MCP provides structured results and web review links; see [frontend boundaries](frontend.md). Exact execution links remain available inside the full app without replacing its project navigation.

## Screen tree

```text
Redpact
├── Connection / startup
│   ├── Connecting to local Redpact
│   ├── Local server unavailable
│   │   └── Retry connection [action]
│   └── No connected project
│       ├── Open project folder [action]
│       └── Manage projects [dialog]
│
├── Shared application header
│   ├── Toggle Sidebar [action]
│   ├── Current page title / navigation / actions [section; contents below]
│   └── Problems [dialog]
│
├── Sidebar
│   ├── Project switcher
│   │   ├── Select connected project [action]
│   │   ├── Connect project [action]
│   │   └── Manage projects [dialog]
│   │       ├── Search by name or path
│   │       ├── Connected / Disconnected [tabs]
│   │       ├── Connect / Rename [dialogs]
│   │       ├── Open / Project settings [actions]
│   │       ├── View history [dialog]
│   │       ├── Disconnect [confirmation dialog]
│   │       └── Reconnect [action]
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
│   │   │   │   └── Run Tests [action]
│   │   │   └── Playwright [tab]
│   │   │       ├── Screenshots [tab]
│   │   │       │   └── Selected capture file
│   │   │       │       ├── Test Code [tab]
│   │   │       │       └── Screenshots [tab]
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
│   │   │   └── Refresh [action; read-only]
│   │   ├── Dependencies [page]
│   │   │   ├── Overview [tab]
│   │   │   │   └── Service relationships → selected service details
│   │   │   ├── Configuration [tab]
│   │   │   │   └── All dependencies → fixed definitions (no selector)
│   │   │   │       ├── Per-environment / Shared local / Remote connection / Mock
│   │   │   │       ├── Additional services
│   │   │   │       └── Environment key-value overrides
│   │   │   └── Fixed dependencies and environment bindings [dialog]
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
│   │   │   │       └── Desktop / Mobile evidence selection [viewer-local]
│   │   │   ├── Unit Test [tab; conditional]
│   │   │   │   ├── Changed unit test files → Code / Command results
│   │   │   │   └── Run Tests / Cancel command [action]
│   │   │   ├── Integration Test [tab; conditional]
│   │   │   │   ├── Changed integration files → Code / Execution results
│   │   │   │   └── Run Tests [action; latest submission]
│   │   │   ├── Log [tab; conditional]
│   │   │   │   └── Execution history and copyable execution details
│   │   │   └── Environment [tab; conditional]
│   │   │       ├── Fixed project execution configuration
│   │   │       └── Recorded environment status, resources and cleanup controls
│   │   └── Selected branch without a live checkout [page; optional]
│   │       └── Committed changed files → selected file diff
│   │
│   ├── GitHub repository [link; sidebar footer icon]
│   ├── Star on GitHub [link; sidebar footer icon]
│   ├── Update [action; newer npm version only]
│   └── Settings [page; global, sidebar footer icon]
│       ├── Updates [section]
│       ├── Agent plugins [section; check versions and confirm installation]
│       │   └── Check for updates [action; no installation]
│       ├── Preferences [section]
│       │   ├── Theme: Light / Dark / System
│       │   ├── Word wrap
│       │   ├── Show Git-tracked files only [switch; browser-local]
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
  browser tab; users give Stars on GitHub.

- Project display options start with every available item visible. Hiding an item
  preserves the current page and active work. Worktrees and global Settings remain
  accessible. Visibility is remembered per project in browser storage. The display-options
  button has no numeric badge; its accessible name and tooltip retain the hidden-item
  count. Use the menu checkboxes or **Show all** to restore hidden items.
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
  tabs focus on changed files. Viewer Run controls use the shared
  [execution scope](configuration.md#default-execution-scope), without a per-run selector;
  agent API/CLI requests can override it. Unit uses the configured command or opted-in
  `fileCommand`;
  worktree Integration executes the latest submission rather than the selected source file.
- Project Playwright records remain browsable without a live primary checkout.
  Project Unit and Integration require that checkout. Branch-only review exposes
  committed diffs without worktree execution controls.
- Playwright lists current worktree capture drafts and changed project capture files
  before execution as well. Desktop/Mobile filters images from the latest matching
  execution using recorded viewport metadata; it does not hide source files.
  The Mobile switch stays in the screenshot viewer rather than the app header.
  Functional test results are available through Tests and execution history.
  Task-draft cleanup is an explicit agent operation through the retained cleanup
  endpoint; it has no viewer button. Environment lifecycle controls remain available.
- Container is a manually retained application environment. Its service/dependency
  selection comes from fixed project configuration; it is separate from recorded
  test execution evidence.
- The shared app header always provides the sidebar toggle, the current page's title
  or navigation and actions, and Problems, in exactly one row at every viewport.
  Worktree review tabs and test execution actions appear there. Container, Tests, File Viewer, Git Graph, Dependencies,
  Project settings and global Settings use the same header space. Settings form save
  and draft-recovery actions appear in the header; section-specific controls remain
  with their owning section. File-level navigation remains with the selected content;
  Git Graph keeps its built-in branch/search controls within the graph while
  Refresh uses the app header. The viewer has no Uncommitted, Merge, PR or Fetch
  action; agents own Git writes and publication through host tools and retained backend
  workflows, as described in [Git operations](git.md). See [header layout](frontend.md).
- There is one current project/page, without workspace tabs or New/Close tab actions.
  Sidebar project, page, worktree and branch selections update that destination.
  Choosing another project opens its default review page. Browser Back/Forward
  restores connected destinations; reload restores the current location, without
  drafts or detailed view state. Repeated selection adds no duplicate history entry,
  and navigating after Back discards forward entries. File selections, review subtabs
  and scrolling do not add history entries. Leaving a page may release its state;
  hidden workspace tabs do not retain drafts, DOM or subscriptions.
- The sidebar starts open at widths of 1100 CSS pixels or more and collapsed below
  that width. Crossing this breakpoint updates its open state. The shared header's
  toggle remains available; below 768 CSS pixels it opens the mobile drawer.
  Full, Half View and Mobile keep the header on one row, with fixed sidebar/Problems
  controls and independent navigation/action scrolling only as a fallback. Remove
  low-value controls before crowding the header. Half View reserves the content width
  for the current page instead of a permanent sidebar; verify it at 800px alongside
  Full at 1920px and Mobile at 390px or 414px.
- Worktree display options appear on hover anywhere in the Worktrees section, on
  keyboard focus, while the menu is open, and for non-hover input.
- Settings sections and actions can depend on available API capabilities. The MCP
  approval preference shown here does not imply a separate approval-inbox page.

See [frontend conventions](frontend.md) for composition rules and [execution](execution.md) for lifecycle semantics.

See [runtime updates](installation.md) for Update visibility, manual checking and installation conditions.
