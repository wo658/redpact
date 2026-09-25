# Application page captures

The maintained scenarios under `project/captures/` navigate the actual
Redpact application. Named PNGs capture the complete configured CSS-pixel viewport (1920 × 1080 by default),
including the app header, sidebar, page navigation and visible content. The viewport
is not resized to fit a component. Desktop and mobile captures retain their page context; the
Dependencies empty overview is exercised in both entry flows.

| Page | Captured states |
| --- | --- |
| Workspace | Navigation, open project menu, web/macOS/Windows-layout history controls and expanded/collapsed sidebar at desktop/mobile widths |
| Settings | Complete light and dark pages |
| Project settings | Execution configuration with page context |
| Git Graph | Real repository commit history |
| Dependencies | Empty overview, connected services, service details, environment values, editing, saved values, help dialog |
| Worktree | Empty Diff, unconfigured unit tests, empty integration source/results, empty execution log, environment selection |
| Worktree UI Review | Empty screenshots and empty recorded source, both with persistent tabs |
| Project Playwright | Empty screenshots, functional file list, selected source, empty run history |
| Problem notice | Actual settings validation failure with the shared Handoff shell and visible diagnostic |

Captures await the expected state and fonts. A visible container alone does not
establish readiness: empty Dependencies must display its empty message before the
image is attached. Settings captures use the current dropdown controls. Names use
`Page / Group / State`; grouping remains standard Playwright attachment metadata.

Dependency states use the real revision-checked configuration API in the isolated
`/app` application. The scenario restores its original configuration in `finally`.
It never modifies the controller's shared primary settings. There are no intercepted
responses, copied JSX, invented execution records or nested environments.

Run the `project-captures` target on the connected controller using the actual development
checkout, and verify the returned run in that worktree's list. See
[self-E2E](../e2e/README.md). Native adapter verification additionally checks the
checkpoint names, exact viewport dimensions and retained bytes after cleanup.

## Coverage limits

Populated execution results, retained screenshot history, failure dialogs and native
Tauri chrome are not covered by these scenarios. Workspace history scenarios cover
1280px and 390px layouts, with captures also covering 800px and dark mode; their macOS and Windows branches are rendered in Chromium and does not
verify actual OS window controls or native dragging. Windows control scenarios replace
only the Tauri IPC boundary to verify button calls, maximize state, failure feedback
and keyboard retry against the real viewer. Their component
or API tests do not substitute for captured page evidence. Capture runs execute only the selected worktree.

## Functional tests

The separate `project-tests` target checks theme persistence, dependency help and
configuration interactions without producing named screenshots on success. Workspace
history scenarios also cover browser/native-button traversal, forward-history replacement,
closed-tab recovery, reload and responsive sidebar controls. Functional cases remain
independent from capture scenarios. Capture preparation
assertions establish the intended image state, not complete functional coverage.

## UI language contract

Before writing or changing a scenario, read `playwright.uiLanguage` from the project's
effective settings. Redpact passes it into the test container as `REDPACT_UI_LANGUAGE`.
Every scenario must initialize the application's language before its first navigation
through a project helper, then use role/name locators in that declared language. The
browser `locale` is not a substitute: it does not determine how an application chooses
its UI language. This project uses `project/app.ts` for the default configured language;
tests that intentionally verify another locale must pass that language explicitly and
state the localization intent.

Project Screenshots shows named capture artifacts; Tests shows current functional
sources; Runs retains recorded sources and diagnostics. All three retain file navigation beside the selected view. Worktree UI Review lists changed sources beside recorded evidence for the selected file. Run history never starts execution merely by being viewed.

## Maintenance scope

The configured root remains `ui-tests`. `worktree/captures` and `worktree/tests` are
Git-ignored task drafts. `project/captures` and `project/tests` are maintained
sources committed with the application. Shared settings declare all four targets.
No empty worktree directory needs to be committed; agents create it when authoring.

Every run retains its source folder and artifacts in Redpact history. At task end,
use UI Review's Clean up worktree code action or the worktree cleanup-worktree endpoint.
It refuses removal of unrecorded changes. Stored sources and images remain readable
after draft or worktree removal. Project Screenshots and Tests show maintained
content; worktree evidence stays in worktree review, project Runs and Log.

## Automatic viewport evidence

Managed page and element PNG screenshots retain their page's CSS viewport without
annotations or custom test imports. The runner embeds a `redpact.viewport` PNG text
chunk before returning the screenshot or saving its path, then stores the dimensions
with each attachment. This preserves provenance across delayed attachments and
identical crops from different viewport sizes. Device pixel ratio and image crops
do not determine Mobile/Desktop classification.

The worktree Mobile toggle filters each image at 768 CSS pixels. Test-local resizing
can therefore produce both groups within one execution. PNGs without observed
metadata are shown in both groups as `Viewport unavailable`; no dimensions are
backfilled from run settings. The adapter targets the managed, pinned Playwright
1.63.0 client factories; its real Chromium regression must pass on runner upgrades.
Screenshot assertion comparison artifacts and externally supplied PNGs without the
metadata remain unclassified. Concurrent viewport changes are not inferred.
