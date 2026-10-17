# Review and handoff

Read for review-only requests or when handing off completed work. Detailed authoring
and execution rules live in unit-tests.md, integration-tests.md and playwright.md;
load only a selected layer when it needs further work.

## Review without execution

For an explicit read-only review request, resolve the target and inspect its diff, existing
test sources, captured browser evidence and recorded unit/integration results on the connected
instance. Do not initialize missing settings, edit files, create a checkout,
execute tests, start a browser capture, merge, or approve on the user's behalf. An explicit
additional request may authorize those actions separately.

Map requested behavior to available evidence and identify missing, failed, blocked,
or possibly outdated checks. Compare captured identity with current source where
available; unit command records and captured application views cannot prove source freshness.
Start with `get_workspace_status` for the exact checkout and `list_runs` for
older attempts. Use `get_review_context` for one execution's bounded failures,
evidence references and relative review path. Resolve that path against the connected
viewer origin; retrieve recorded source/log/image with `get_run` as needed.
Use the evidence already present and identify unavailable data. Review is a human
handoff, not a new persisted approval state or a promise of fresh verification.

## Review handoff

Audit coverage from every changed acceptance outcome, not merely the guides chosen
at kickoff. Public application behavior requires Integration evidence; frontend
behavior requires Playwright functional evidence. For combined work, verify the user
flow and any changed API/persistence contracts needing independent coverage.
Unit-only completion needs an isolated pure-logic rationale or explicit user scope.
Explain omitted layers by relevance or restrictions. Missing setup, blocked runs,
skips and unreached assertions remain gaps; Unit success cannot close them.
Do not claim full verification or proceed to auto merge with required evidence missing.

Give a concise mapping from each meaningful acceptance intent to the relevant
source/test, observed result, and scenario/checkpoint when applicable. Reuse the task
response or existing requirements document; do not create a parallel registry.
Include the actual checkout, connected viewer origin, available verified links,
applicable run/environment IDs and remaining review gaps.

Keep these claims distinct:

- Unit: failing/passing assertions observed locally, plus connected whole-command
  status and output when recorded; no inferred per-case Redpact verdicts.
- Integration: immutable submission, actual run and observed Steps on the intended
  checkout; application changes require a fresh environment for new evidence.
- Playwright: recorded scenario/checkpoint IDs, captured sources and exactly which
  browser/visual checks were observed, with capture and cleanup failures separate.
- Human review: material is ready for inspection; no human approval unless the
  supported interface records an actual user decision.

Briefly explain omitted evidence when its relevance is not obvious. A capability
gap may leave registration or review incomplete even when local checks pass.

MCP results are snapshots; request fresh results for changed state. Unit, Integration
and Playwright approval authorize only the captured execution, not acceptance of code.
Use the returned `reviewPath` or `get_review_context` with the request kind and ID,
and link that path on the same connected viewer origin. The user inspects the captured
request and explicitly approves there; do not submit approval on their behalf.
Neither a text reply nor opening the page records approval. If the viewer is unavailable,
preserve the pending request and report the gap.
