# Capture for human review

Use with the [Playwright execution guide](playwright.md) for `purpose: "capture"`.
Use `worktree/captures` for task-only review; use `project/captures` only for scenarios
that the project will maintain. Both retain source and images in execution history.
Worktree review shows drafts and captures from changed maintained scenario files.
Changing only application code does not select unchanged project capture files; use
a task-specific draft for that review. A changed scenario file exposes all its recorded
captures, not only images whose pixels differ. See the main guide's review scope.
The output lets a human judge the actual application state and surrounding context.
It is not an automatic pixel-diff assertion or proof of functional correctness.

## Mobile and Desktop first

Use two initial review groups: Mobile (414 × 896) and Desktop (1920 × 1080).
Set width and height in the UI Review toolbar, or pass the same viewport to the
Playwright run API. Run the same target once per group and inspect both results.
The toolbar keeps each group's edits while switching; Mobile widths are 320–767,
Desktop widths are 768–3840, and heights are 240–2160 CSS pixels. These describe
viewport layout, not native device emulation. Editing dimensions affects the next
execution, not stored images; recorded dimensions remain visible with each run.

Author scenarios without `page.setViewportSize`, per-file `test.use({ viewport })`,
or loops over viewport sizes: execution owns the dimensions so the toolbar and
recorded run agree. Keep attachment names stable across Mobile and Desktop; do not
encode pixel widths as extra screenshot groups. Add further boundary executions
only for a concrete responsive risk or explicit user request, retaining the two
review groups. Do not change CSS zoom or stretch saved screenshots to simulate a
new aspect ratio.

## Choose a reviewable frame

Default to a viewport screenshot from the actual application at the intended viewport.
For focused review, capture a meaningful section containing the changed control,
its context and the visible outcome. A form, dialog, filter plus results, or navigation
plus destination is usually more useful than an isolated button. Roughly a third of
the viewport can be a useful framing heuristic, not an area quota: preserve the
complete relevant section even when it is smaller or larger. Avoid full-page images
unless the question concerns the whole page. Do not shrink the app, change CSS zoom
or use a smaller viewport just to make the artifact fit its viewer.

Capture an individual control only when its own appearance is the review question.
Do not produce one image per click or button by default. Select meaningful states,
such as initial form, validation failure and successful result. Await real readiness,
fonts and the resulting state; fixed sleeps do not establish readiness.

Attach named PNGs using `info.attach`, with `page.screenshot({ scale: "css" })` for
viewport context or `section.screenshot({ scale: "css" })` for a justified section.
CSS-pixel captures preserve the intended logical size; the viewer controls display
and scrolling. Do not claim a viewer feature was implemented by changing captures.

## Screenshot page and semantic groups

Name each PNG attachment `Page / Group / Capture name` using the exact ` / `
delimiter. The screenshot viewer displays the prefix as a group heading and the last
segment as the image label. Use stable page/feature prefixes in the user's language;
reuse them across files or tests. For example:

```ts
const group = ["Settings", "Appearance"]
await info.attach([...group, "Dark theme"].join(" / "), {
  body: await themePanel.screenshot({ animations: "disabled", scale: "css" }),
  contentType: "image/png",
})
```

Ordinary names remain ungrouped. Slashes without surrounding spaces (URLs and
paths) remain literal. Avoid empty segments. No settings registration, special
annotations or extra dependency is needed. The full name identifies the captured
checkpoint; changing its group prefix creates a different checkpoint in history.

## Check the resulting evidence

Inspect the retained attachment names, image dimensions and capture run outcomes.
When visual inspection is authorized, open the images and verify that the intended
state and context are visible and text is readable. Otherwise state that captures
were recorded but not visually inspected. Keep failed captures and missing images explicit. No before/after comparison is required.
Successful capture execution is not a user's visual approval.
