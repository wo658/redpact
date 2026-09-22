---
title: Frontend conventions
description: Shared visual rules, navigation, live evidence and accessibility.
---

# Frontend conventions

The default `app/web` entry is a connected viewer, not a backend specification or
a demo. Separate demo surfaces cannot establish real execution or approval behavior.
Use [UX navigation](ux-navigation.md) for page ownership and [architecture](architecture.md)
for service boundaries. Keep operational behavior out of styling-only abstractions.

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

File Viewer, worktree review, committed branch and Git Graph comparisons, and the
uncommitted changes dialog share image presentation. PNG, JPEG, SVG, GIF, WebP,
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

The app header owns open-workspace tabs and native drag space outside the rounded content
frame; it does not repeat the current page title. Workspace tabs use
a fixed width, left-aligned icons and truncated titles, with a subtle outline and a brighter
selected surface. The adjacent plus button opens the current page location in a fresh tab and remains reachable
when the strip scrolls horizontally. Selecting or closing a tab reveals the active tab. The
browser desktop and native macOS provide a sidebar toggle; compact mobile screens retain
the sidebar trigger. In mobile and native layouts,
the open sidebar places this control beside the project selector, immediately before
project display options. When closed, a reopening control sits below the workspace
header. Worktree display options appear while hovering anywhere in the Worktrees
section, including its remaining space above the footer. Keyboard focus, an open
options menu and non-hover input keep the control available. On native macOS, the toggle
and Back/Forward buttons occupy the 48px titlebar beside the window controls; they remain
accessible with the sidebar collapsed. Mobile keeps the sidebar sheet trigger. Browser
desktops omit app Back/Forward buttons and use browser controls.

Project/worktree tab activation and sidebar page selection use the browser session history.
Native Back/Forward call the same History API as browser navigation, across workspace tabs.
Repeated selection adds no duplicate entry; navigating after Back discards forward entries.
History restores the destination page and reopens a closed destination tab while its project
is connected. Reload restores the current destination, but not drafts or other tabs. File
selection, review subtabs and scroll changes do not add history entries. The native buttons
remain available because the History API does not expose complete traversal availability;
at a history boundary traversal has no effect.
The sidebar remains on the canvas. Preserve desktop
gutters, collapsed state, full-width mobile content and macOS toolbar positioning.
Workspace IDs are independent of project/worktree IDs. Each tab records its page and target;
sidebar navigation updates the active tab, and labels reflect its current location. See
[UX navigation](ux-navigation.md) for new-tab and close behavior.
Open workspace tabs retain their React state and DOM through React Activity. Hidden tabs
release effect subscriptions; activating a tab restarts reads without discarding its view state.
Sidebar providers belong to each workspace tab. This retention is session-only and ends when
the tab closes; it does not persist drafts across reloads.

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

Every destructive `Notice` is a problem state and uses the same shell automatically.
It supplies the visible diagnostic as copyable context under **Problem details** so a
user can hand it off immediately. The diagnostic stays visible once; the formatted
copy text appears only if clipboard access fails. Views with durable identifiers,
selection or retained resources still provide their own specific `CopyHandoff`
context rather than relying on this fallback.

Only the active workspace mounts the project selector, so hidden tabs cannot retain
its portaled menu.

## One review toolbar

A page owns one `ReviewToolbar` with navigation, secondary and actions slots.
Project Tests supplies Unit/Integration/Playwright; active Playwright supplies
Screenshots/Tests/Runs and its execution action within the same toolbar. File-level
Code/Results tabs remain in their file panel. Controls can wrap at narrow widths;
navigation groups own local overflow. Worktree review keeps navigation on the left
and actions on the right in one row, including Playwright’s Mobile and Run Playwright
controls. Each side scrolls horizontally when needed; labels keep their normal
font size and do not wrap.

Wrap related content in `ReviewToolbarScope`. One active `ReviewToolbarOverride`
may target a scope; nested scopes are independent. Unmount inactive overrides.
An omitted slot inherits, `null` hides, and supplied content replaces. Unmounting
restores defaults. The shared component owns portals and preserves tab contexts;
views do not register React nodes through effects or build another page toolbar.

## Observation, loading and recovery

Native file events are coalesced into scoped server invalidations. Expensive refresh
work is bounded per target; unchanged projects are not rescanned on unrelated events.
Watchers are disposed with their scope and recover explicitly from resource failures.
The viewer subscribes to scoped SSE and refreshes the affected query. Opening a page
or observing changes never starts tests. Manual Container additionally polls its
state/input identity while open.

Keep navigation available during loading, empty and failed reads. Preserve active
tabs while content remains available; hide only confirmed-empty worktree sections.
Errors and active execution/cleanup must remain reachable. Stale evidence requires
a visible diagnostic, not a fabricated empty state or silently current result.
Handle live-update notices through the shared components and clean subscriptions
on exit. Keep errors beside the action or content that owns recovery.

## Language and access

Translate UI copy through bundled locale catalogs; preserve identifiers and literal
source. Theme supports Light/Dark/System and word wrap defaults on; browser-storage
failure permits session interaction. MCP cards follow host appearance. These are not
project configuration fields.

Use semantic buttons, labels, tabs and dialogs with keyboard focus/selection
behavior. Responsive reflow must preserve controls, file selection and diagnostics.
Run relevant functional Playwright tests against the actual application for screen
changes. For layout/style changes, inspect desktop/mobile captures too. Component,
structure and build checks supplement this evidence, never replace it.

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
