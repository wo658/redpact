---
title: Frontend conventions
description: Shared visual rules, navigation, live evidence and accessibility.
---

# Frontend conventions

The default `app/web` entry is a connected viewer, not a backend specification or
a demo. Separate demo surfaces cannot establish real execution or approval behavior.
Use [UX navigation](ux-navigation.md) for page ownership and [architecture](architecture.md)
for service boundaries. Keep operational behavior out of styling-only abstractions.

The local Sidebar App renders the same connected React viewer after explicit runtime
startup; installation and stopped states stay in an isolated companion shell. Its
bundled entry uses an App-only MCP transport for API reads/writes, scoped live changes
and binary artifacts. Fonts and icons are inline; no nested iframe or browser network
permission is required. The standalone entry retains HTTP and native SSE.
See the [App Page installation contract](installation.md)
for lifecycle, access boundaries, size limits and host verification requirements.

## Full app and chat results

The GPT-embedded viewer is the primary experience for following agent work,
reviewing evidence, approving execution and managing test environments. The standalone
browser and Global App Page share project/worktree navigation, file and Git inspection,
test catalogs, environments, dependencies, and project/global settings. Opening the
app without a record restores project navigation or the connect-project screen.
Manual Git writes and publication remain agent responsibilities; the viewer has no
Uncommitted, Merge, PR or Fetch action. See [product scope](architecture.md) and
[Git operations](git.md).

Chat MCP returns text and structured evidence with web review paths; it does not render inline cards. An exact `/?page=review&kind=unit|integration|playwright&id=<id>` link opens the recorded request or execution inside the full app. Record identity determines its worktree; current project selection cannot retarget it. Opening a link never requests a run. The linked review retains its worktree-bound history and explicit approval controls; test cancellation is not exposed.

## File Viewer Git filter

**Settings → Preferences → Show Git-tracked files only** defaults off. This browser-local
preference applies to every File Viewer view and project on the same origin. It is saved
in browser storage and survives reloads; changes also update other open browser tabs.
If storage is unavailable, the choice remains usable for the current session. It is not
a project execution setting. File Viewer has no separate filter control.

When checked, the viewer reads the displayed project's checkout Git index and lists
tracked files plus their parent directories. Modified tracked files, newly staged
files and force-added ignored files remain eligible. Untracked files and folders
containing only untracked files disappear. Existing file safety rules still apply:
Git metadata, symbolic links and non-regular files are excluded; deleted files are
not reconstructed from the index. When unchecked, normal filesystem browsing resumes,
including eligible untracked and ignored files under the existing visibility rules.

Changing the filter clears the selected preview. Live refresh rechecks tracking;
a file removed from the index cannot retain its old preview while filtering is on.
Collapsing a parent folder alone does not discard a valid selected file. An empty
filtered directory shows an explicit empty state. Non-Git projects and Git read
failures show a diagnostic instead of an unfiltered fallback or stale tree/preview;
Retry remains available. Turning the preference off in Settings restores ordinary browsing.

The project-file HTTP read accepts optional `trackedOnly=true|false` (default false)
for both directory listings and file previews; other values are rejected. A filtered
read of an untracked file is rejected. See the generated HTTP API for its schema.

## Test file browsing

Unit and Integration lists return file paths separately from selected-file source.
The lists have no 200-file cutoff or combined source-byte budget. Project Tests
shows all matching Git-visible files; worktree review shows changed matching files.
Selecting a file fetches only that source and cancels the previous selection's
request, so a late response cannot replace the current file.

Previews retain a 200,000-byte per-file limit and reject binary content, symlinked
files and paths outside the selected checkout. Files with preview errors remain
selectable in the list. Previewing a file does not execute it or change the execution
scope described in [execution](execution.md). Recorded submission sources stay immutable.

## Components and visual rules

Use the adopted shadcn Base UI Nova primitives, `render` composition and Base UI event
contracts. The allowed shadcnblocks extension is the Linear theme; do not add unrelated
registries or reintroduce Radix primitives. Retain specialized Git tree/diff/syntax,
Kibo list and licensed ReUI timeline integrations for their existing roles.

`src/components/ui` is vendored. Feature work composes it; shared design changes may
adapt density/geometry there once, preserving licenses and behavior. Do not override
one shared control differently on every screen or edit unrelated vendored modules.
Use semantic theme tokens, not raw colors or Tailwind palette utilities in components.
Preserve Redpact colors and bundled Inter Variable with system glyph fallbacks.
Code and diff surfaces use bundled JetBrains Mono Variable before the system mono
fallback. Prism syntax tokens use the complete GitHub PrettyLights light/dark palette
through local `--code-highlight-*` variables; do not depend on a syntax package's
fallback colors or add per-screen syntax overrides.

| Role | Geometry and typography |
| --- | --- |
| Page title | 24/32px, weight 600 |
| Section title | 16/24px, weight 600 |
| Reading text | 14/21px or 16/24px for long prose |
| Controls and navigation | 13px labels; compact actions/metadata may use 12px |
| Toolbar action | Compact 28px pill or circular icon control |
| Form input/selector | Rectangular editable surface with 8px corners |
| Sidebar selection | Soft rectangle, 8px corners |
| Main frame/dialog | 12px corners; restrained border/elevation |
| Static badge/inline code | Compact 6px corners |

Shape follows role; do not force every control into a pill. Persistent selection
uses `accent`/`accent-foreground`; hover uses a lighter transient state. Checked
state and keyboard highlight stay distinct. Avoid decorative cards, nested borders,
gradients and per-row boxes. Preserve action inversion and semantic error colors.

## File and folder icons

File Viewer, changed-file trees and source/diff headers use bundled Material Icon
Theme SVG assets with the React icon pack. Exact file names take precedence over
extensions; compound extensions such as `d.ts` take precedence over `ts`. Unknown
files and folders use the theme defaults. Folder icons follow their name and open
state. Light-specific variants follow the existing Light/Dark/System preference.
Icon colors are upstream artwork rather than application status colors; Git status
remains visible as `A/M/D/R/C` and line counts beside each changed file.

The Vite build generates associations from the pinned `material-icon-theme` package
and includes its SVG assets and MIT notice locally. No CDN or runtime manifest
generation is required. The viewer uses file/folder names, not editor language-ID
inference or user-configurable icon associations. Action icons continue to use Lucide.

## File content previews

File Viewer, worktree review, and committed branch and Git Graph comparisons share
image presentation. PNG, JPEG, SVG, GIF, WebP,
AVIF, BMP and ICO files open as images on a transparency checkerboard. Browser
image decoding determines format support; corrupt or unsupported bytes show an
explicit decode error. Each image is limited to 5 MiB; ordinary UTF-8 source
previews retain their 1 MiB limit. Unsupported binary files remain explicit.

SVG opens in Preview with a Source tab for the original text or comparison patch.
Source-only file surfaces use the same SVG preview and source switch. SVG is loaded
as an image rather than inserted into the document; scripts do not execute and
external SVG resources may not render. File selection cancels pending comparison
reads, and failed refreshes do not leave a different image labeled as current.

Comparisons show Before and After, side by side when the containing workspace is
wide enough and stacked on narrow screens. Missing images are distinct from read
or decode errors. Commit and branch previews use their displayed Git revisions and
retain the original path for renamed files. Staged previews compare HEAD to the
index; unstaged previews compare the index to working files. Merely opening any
preview never executes project code.

## Layout and reading width

The shared app header sits outside the rounded content frame and remains exactly
one row in Full, Half View and Mobile. It always contains one sidebar toggle, the
current page's title or navigation and actions. The shared Play execution action,
when available, sits at the far right; diagnostics have no persistent header button.
There is no workspace-tab strip, New tab or Close tab action. The standalone browser
and embedded App Page use the same header and one current project/page.

The embedded GPT viewer starts with the sidebar collapsed at every width, including
Full and Half View. Resizing does not change this state; the header toggle opens or
closes it manually. Reopening the embedded viewer starts collapsed again. The standalone
app starts open at 1100 CSS pixels and wider, and collapsed below that width; crossing
this breakpoint updates its open state. Below 768 CSS pixels, navigation uses the mobile sidebar drawer with an explicit
Close sidebar action inside the drawer.
Half View is a first-class design target: keep the content area available without a
persistent sidebar. Preserve desktop gutters and full-width mobile content. Verify the
actual application at desktop Full (1920px) and Half View (800px), including both
captures for layout changes. Mobile captures are only required when specifically requested.

Worktree display options appear while hovering anywhere in the Worktrees section,
including its remaining space above the footer. Keyboard focus, an open options menu
and non-hover input keep the control available.

Project, worktree, branch and sidebar-page selections use browser session history.
Browser Back/Forward restores the destination while its project is connected.
Repeated selection adds no duplicate entry; navigating after Back discards forward
entries. Reload restores the current destination, but not drafts or detailed view state.
File selection, review subtabs and scroll changes do not add history entries.
Changing the current page can release its detailed state; there are no hidden workspace
tabs retaining React state, drafts or subscriptions. See [UX navigation](ux-navigation.md).

The app owns viewport height; evidence and lists scroll in their own panels.
Flex/grid boundaries need `min-w-0` and, for nested scrolling, `min-h-0`.

Use exactly the shared `640`, `768` and `wide` content-width policies from index.css:
settings use 640, prose/evidence rows use 768, and specialized file/diff/graph layouts
use available width. They are responsive maxima, not fixed user preferences.
Settings gutters stay outside the reading column. File Viewer, worktree/branch diffs
and test file browsers fill the content frame without an inset card, outer padding
or a second rounded border. Page toolbars and file headers use bottom separators;
file navigation uses the divider between panels. Keep padding within reading/result
content rather than around the entire browser. Keep file navigation beside
selected-file content, with a responsive picker when needed.

Log uses continuous two-line rows: full wrapping intent, then kind/verdict/localized
time and nearby copy action. Environment/dependency details use readable vertical
rows and bounded key/value tables. Preserve whitespace, literal newlines and complete
diagnostics; avoid making text smaller to fit. Diff/source wrap uses the global
Word wrap preference, with horizontal scrolling when disabled.

When recovery needs help outside Redpact, the owning view uses `CopyHandoff` with a
specific title, summary and structured context. Include identifiers, observed state,
selection and retained-resource references needed to continue work. Keep diagnostic
file contents behind their local access boundary: copy their retained locations rather
than automatically sending logs or secrets to a client. Merge and environment recovery
share this shell without being forced into the same recovery instructions.
The shell standardizes the heading, Copy action, selectable text, clipboard-failure
fallback and optional labelled details disclosure. Do not label it generically as an
agent handoff or force unrelated recovery content into a common text template.

Ordinary error `Notice` components do not automatically use `CopyHandoff`. They
follow [Problems and background failures](#problems-and-background-failures).
Recovery views with durable identifiers, selections or retained resources continue
to provide their own specific `CopyHandoff` context.

## One review toolbar

Each page owns one `ReviewToolbar` with navigation, secondary and actions slots. In
the app, it renders into the shared header beside the sidebar toggle,
rather than adding another toolbar row inside the content frame. Standalone component
usage retains an inline toolbar. Portals preserve the page's Tabs context and action
state; a page change removes its previous header content.

Worktree review supplies its available Diff, Playwright, Unit, Integration,
Log and Environment tabs, together with test execution actions. Project Tests
supplies Unit/Integration/Playwright; active Playwright supplies Screenshots/Tests/Runs
and its execution action within the same header. Container supplies its title, status
and lifecycle actions. File Viewer and Settings supply their page titles; Dependencies
supplies Overview/Configuration and Help. Git Graph supplies its title and Refresh.
Its built-in branch, remote-visibility and commit-search controls remain with the graph.
Project and instance settings place their form save and draft-recovery actions in the
shared header; independent settings sections keep their own controls. Run controls
use one shared 28px Lucide Play icon button at the far right of the header, with an
accessible action name and native hover tooltip. Container Start, Restart and Stop
and Git Graph Refresh use the same compact icon control with their respective Lucide symbols. Keep explicit text in the
Playwright target-selection dialog. Execution controls use the shared execution
default, with no per-run scope selector or task-draft cleanup
action in the header. Agent overrides and explicit cleanup remain available through
the contracts in [execution](execution.md).

File names, source/diff controls and file-level Code/Results tabs remain in their file
panels. The capture viewer's Mobile switch belongs beside the recorded screenshots,
not in the app header; it filters stored Desktop/Mobile evidence without changing the
source list or running tests.

Keep the shared toolbar on one row at every width. Prefer removing low-value controls
to crowding it; never add a second row or reduce label font size to make everything fit.
Navigation and action groups independently scroll horizontally as a fallback. Labels
do not wrap. The sidebar toggle and the available Play action stay fixed and reachable
without scrolling through the page's controls.

Run result panels share the execution progress strip described in
[execution](execution.md). Active Unit and Integration phases also appear by their
Run controls so a user can see progress without switching tabs.

Wrap related content in `ReviewToolbarScope`. One active `ReviewToolbarOverride`
may target a scope; nested scopes are independent. Unmount inactive overrides.
An omitted slot inherits, `null` hides, and supplied content replaces. Unmounting
restores defaults. The shared component owns portals and preserves tab contexts;
views do not register React nodes through effects or build another page toolbar.

## Observation, loading and recovery

Native file events are coalesced into scoped server invalidations. Expensive refresh
work is bounded per target; unchanged projects are not rescanned on unrelated events.
Watchers are disposed with their scope and recover explicitly from resource failures.
The viewer subscribes to scoped SSE and refreshes the affected query. Project Tests
uses the primary worktree scope for Unit and Integration, without also sending a project
scope in the same subscription. Opening a page
or observing changes never starts tests. Manual Container additionally polls its
state/input identity while open.

Keep navigation available during loading, empty and failed reads. Preserve active
tabs while content remains available; hide only confirmed-empty worktree sections.
Errors and active execution/cleanup must remain reachable. Stale evidence requires
an accessible diagnostic in the owning view or Problems, not a fabricated empty
state or silently current result.
Handle live-update notices through the shared components and clean subscriptions
on exit. Route noncritical diagnostics to Problems while keeping recovery controls
with the owning action or content.

## Problems and background failures

All noncritical error notices are collected in **Problems** without inserting an
inline alert into the page. This includes initial feature reads, background refreshes,
failed saves/actions, invalid settings, Git/image diagnostics and execution/cleanup
errors. The execution verdict, progress and disabled approval/action controls remain
truthful; collecting a diagnostic never turns a failure into success or enables a
blocked operation. Successful content stays available and may be outdated until a
successful refresh.

Only errors explicitly marked critical stay inline, such as failure to connect to
the server before the application can load. A feature request returning 503 is not
itself critical. Independent components without the app's Problems provider retain
an inline fallback so diagnostics cannot disappear outside the shared app shell.

New noncritical diagnostics show a compact notification at the bottom right, outside
the header. It expires after 8 seconds; hover or keyboard focus pauses the timer.
Clicking the notification or its close control dismisses it without clearing collected problems.
New distinct problems update the same notification rather than adding a stack.
Repeated observations of an existing message/location update its count without
reviving a dismissed notification. Clearing the list allows a later occurrence to notify again.
The notification never automatically opens a modal or navigates away from the current
page. Global **Settings → Problems** contains the full list of messages, last-seen
times, observation counts and page locations, and the explicit clear action. There
is no persistent Problems button in the header or connection screen. Informational
notices and user-requested recovery dialogs keep their existing roles.

Problems are application-wide browser-session memory and are lost on reload;
they are not server history. Matching message/location pairs share one row. The list
retains the latest 100 rows and at most 16,384 characters per message. Clearing it does
not retry requests or resolve the underlying problem. Startup connection failures
still show the connection screen and Retry.

## Language and access

Translate UI copy through bundled locale catalogs; preserve identifiers and literal
source. Theme supports Light/Dark/System and word wrap defaults on; browser-storage
failure permits session interaction. These are not
project configuration fields.

Use semantic buttons, labels, tabs and dialogs with keyboard focus/selection
behavior. Responsive reflow must preserve controls, file selection and diagnostics.
Run relevant functional Playwright tests against the actual application for screen
changes. For layout/style changes, inspect desktop Full and Half View captures too;
Mobile captures are optional unless requested. Component, structure and build checks
supplement this evidence, never replace it.

## Documented palette

The CSS implementation remains in [index.css](../app/web/src/index.css). The
palette-to-CSS regression checks these documented values; update both together for
an intentional design change. Other token details live in CSS rather than another
hand-maintained design registry.

```yaml
colors:
  background: "#fbfbfb"
  foreground: "#1b1b1b"
  card: "#ffffff"
  primary: "#6e78d5"
  primary-foreground: "#ffffff"
  secondary: "#1b1b1b"
  secondary-foreground: "#fbfbfb"
  muted: "#ececef"
  muted-foreground: "#71737a"
  accent: "#d9dcea"
  accent-foreground: "#000000"
  destructive: "#92681b"
  border: "#e8e8e8"
  input: "#bebfc3"
  ring: "#6f6d6d"
  sidebar: "#fbfbfb"
  sidebar-foreground: "#000000"
  sidebar-primary: "#535151"
  sidebar-accent: "var(--accent)"
  chart-1: "#6d6b6b"
  chart-2: "#02755c"
  chart-3: "#a3a1a1"
  chart-4: "#004a37"
  chart-5: "#3b3939"
  dark-background: "#101011"
  dark-foreground: "#e3e4e6"
  dark-card: "#17181a"
  dark-primary: "#e6e6e6"
  dark-secondary: "#7987e1"
  dark-muted: "#141415"
  dark-muted-foreground: "#a1a2a5"
  dark-accent: "#303549"
  dark-border: "#24252a"
  dark-sidebar: "#08090a"
typography:
  sans: Inter Variable
```
