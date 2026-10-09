---
title: Frontend conventions
description: Execution review, worktree-bound history and connected evidence.
---

# Frontend conventions

The default `app/web` entry is the connected execution viewer. HTTP, desktop and
the App Page render the same review surface; mock or demo pages are not backend evidence.
[Architecture](architecture.md) owns server boundaries.

## Navigation and identity

The viewer has two destinations: an exact execution review and its worktree-bound
history. A review URL is `/?page=review&kind=unit|integration|playwright&id=<id>`;
optional recorded project/worktree parameters do not override the execution identity.
The viewer resolves identity from the record. A history destination requires an
explicit worktree binding. Reload and browser Back/Forward restore that destination.
Without execution context, show an empty state asking the user to open a record from chat.

There are no project selectors, management/settings screens, tools menus, test-launch
catalogs, manual Container, Git pages or Copy handoff controls. The host conversation
owns task switching, configuration and code changes. An explicit human approval or
cancellation control remains on the request review; its captured preview must be
visible before approval. [Interfaces](interfaces.md) defines capability and origin rules.

The native host retains its window lifecycle and platform controls. Installation,
stopped and recovery states belong to the companion shell. The App Page bundles the
same React entry with an App-only API/event/artifact bridge, inline fonts and icons,
and no nested iframe or browser network permission. See [installation](installation.md#local-redpact-app-page-experiment).

## Components and visual rules

Use adopted shadcn Base UI Nova primitives, `render` composition and Base UI events.
The allowed shadcnblocks extension is the Linear theme. `src/components/ui` is vendored;
compose it without unrelated edits and preserve licenses. Use semantic theme tokens,
bundled Inter Variable for UI and JetBrains Mono Variable for code, with system fallbacks.
Prism uses local GitHub PrettyLights `--code-highlight-*` tokens.

Use readable 14/21px body text, 24/32px page titles and 16/24px section titles.
Controls use compact 13px labels. Selection uses `accent`/`accent-foreground`, distinct
from hover and keyboard focus. Avoid decorative cards, nested borders and gradients.
Preserve semantic error colors and complete diagnostics.

Recorded file names use bundled Material Icon Theme assets. Action icons use Lucide.
Do not infer test outcomes from file icons, titles or source visibility. Source and
artifact reads remain tied to their recorded execution, never generic project files.

## Layout and reading width

The review and history use normal document scrolling. Source and log panels may
bound their own scrolling. Flex/grid boundaries use `min-w-0`; bounded nested
scrolling uses `min-h-0`. Preserve the
shared `640`, `768` and `wide` content-width policies: prose and evidence rows use
768; source and specialized artifact layouts use available width. Mobile reflow
must retain approval controls, diagnostics and source selection without overflow.

Keep source navigation next to selected content, using a responsive picker where
needed. Recorded source and logs preserve whitespace, literal newlines and wrapping
or horizontal scrolling. Avoid an outer card around an entire source browser.
Screenshots are evidence for visual inspection; show unavailable or failed artifacts
explicitly rather than substituting another run's image.

## Observation, loading and recovery

Native file events drive scoped invalidations. Review subscribes after resolving the
recorded worktree; history uses that same explicit worktree's `scope=evidence`.
This includes review state, executions and shared settings. A historical record with
no worktree remains readable without subscribing to an unrelated checkout.
Opening or refreshing a review never requests a run.

Keep navigation usable during loading and failed reads. Show errors beside their
owning evidence or action. Do not convert stale evidence into an empty or current
result. Preserve cancellation and cleanup outcomes separately from the test verdict,
and dispose event subscriptions on exit.

## Language and accessibility

Translate UI copy through bundled catalogs; preserve identifiers and literal source.
MCP cards and the App Page follow host appearance; standalone viewer theme preferences
do not override the App host. Use semantic buttons, labels, tabs and dialogs with
keyboard focus and selection behavior. Theme and source presentation are viewer
preferences, not project execution settings.

For screen changes, run meaningful Playwright interactions against the actual app.
For layout changes, inspect desktop/mobile captures. Component tests and builds
supplement this evidence. Report any state that could not be verified.

## Documented palette

[index.css](../app/web/src/index.css) owns implementation. The palette regression
checks these values; change both for intentional palette changes.

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
