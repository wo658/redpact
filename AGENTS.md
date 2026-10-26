# Agent instructions

## Read first

Read `docs/architecture.md`, `docs/configuration.md`, and `docs/development.md`.
The website content in `docs/` is the sole maintained product and implementation
reference. Read the relevant feature page before changing its behavior.

## Supported product scope

The primary experience is the GPT-embedded viewer for agent work, test evidence,
human execution approval and test environment management. Support the standalone
web app with the same shared UI and server runtime, using HTTP/SSE and MCP transport
adapters. Keep manual Git workbench controls out of the viewer; agents own Git writes
and publication through host tools and the retained backend workflows. Chat MCP
returns structured results and web review links without inline approval/result cards.
Native Windows, Linux and macOS desktop implementations and release tooling have
been removed. Do not reintroduce native desktop code, settings or release work.
Keep CI focused on shared web/server checks on Ubuntu with Node 24; do not require
an OS/Node verification matrix. See [product scope](docs/architecture.md).

## Documentation is part of completion

- Update the owning `docs/*.md` page in the same change whenever behavior, defaults,
  API/settings, UI navigation, constraints or commands change. Work is incomplete
  while documentation describes the old behavior.
- Update English and Korean together: `name.md` and `name.ko.md`, including titles,
  descriptions, examples, links and both navigation files. Public documentation is
  the bilingual exception to the repository's English implementation-copy rule.
- Reuse an existing topic and link its contract instead of repeating it. Every new
  documentation page must render on the site and appear in both locale menus.
  Do not create internal/public splits, hidden manuals or generated content copies.
- Keep current decisions and limitations in the owning topic. Put proposals in
  issues/PRs and execution/merge journals in task or PR evidence; use Git for history.
- Contributors run `pnpm docs:check` for documentation changes; access to the private
  website renderer is not required to contribute. Before merge, maintainers run
  `pnpm docs:build` against the proposed documentation using the private renderer.
  For renderer or navigation changes, maintainers also run preview and actual-browser
  checks. Report each responsibility separately; do not weaken checks to hide
  missing pages, translations or links.
- In the completion/PR report, name the updated pages or explain why the change has
  no documentation impact. Presence checks do not replace factual/translation review.


## Language and UI

Write repository documentation, comments, examples, and UI copy in English. Preserve product names, identifiers, and syntax.

Exception: user-facing semantic content in submitted E2E tests follows the user's requested language, or the language of their task when unspecified. This includes acceptance scenarios, Vitest `describe`/`test`/`it` titles, case-intent comments, assertion-reason comments, and recorded step names. A Korean task therefore produces Korean review content. Keep code identifiers, API names, paths, and protocol values unchanged; this exception does not change the language of general repository documentation or implementation comments.

The shared app header must remain exactly one row in Full, Half View and Mobile.
Prioritize removing low-value controls before crowding the header. Keep its sidebar
trigger reachable and the shared Play action at the far right, with independent
navigation/action scrolling as a fallback. Keep noncritical diagnostic notifications
outside the header and their full history in global Settings. Follow
[frontend conventions](docs/frontend.md) for placement and responsive behavior. Treat Half View as an explicit design and verification target.

For every UI or screen change, review the relevant Playwright tests and verify the changed screen through the actual application. Run functional tests for affected navigation, controls, states, and responsive behavior; add or update meaningful coverage when missing. For layout or styling changes, also capture and inspect desktop Full (1920px) and Half View (800px) states. Mobile captures are not required unless specifically requested. Browser tools and screenshots are authorized for this verification without a separate request. Static HTML/CSS checks, component tests, and builds supplement this evidence; they do not replace it. Report any unverified state or execution blocker explicitly. Read `docs/frontend.md` before UI work. The default `app/web/` entry is the connected viewer; separate demo surfaces do not specify backend behavior.

## Implementation

Use TypeScript and Hono in `app/server`, with interfaces/workflows/core/adapters boundaries following Functional Core, Imperative Shell. HTTP, MCP and internal application triggers share use cases in `src/workflows`, including single-feature queries. Keep handlers close to Hono routes; transport may reuse pure schemas and formatters but must not implement use cases through adapters. Workflows own I/O, lifecycle sequencing, concurrency, recovery and cleanup; simple reads may directly return adapter results without a forwarding Core function. Core owns pure policies, calculations and schemas, receives data rather than effectful service capabilities, and must not import workflows, adapters or interfaces. Supply time and random identifiers from the Shell. Adapters must not import workflows or interfaces. Wire concrete dependencies in `main.ts`. Avoid controller classes, DI containers, generic storage engines and speculative wrappers; reuse adopted OSS and Node standard primitives.

The accepted settings contract is defined in `docs/configuration.md` (one shared fixed execution configuration): one `.redpact/settings.json`, fixed root `services`, dependency-keyed definitions with `kind`, optional `services` and target-specific `env`, and explicit common runner `tests.env`. The agent accesses project and instance settings only through `redpact settings describe|get|patch|validate|repair`. Read the current revision, apply a JSON Patch subset with that precondition, and validate the actual checkout. Never read or edit settings/runtime JSON files directly in the agent workflow; JSON remains the internal storage format. Use explicit creation for absent settings and revision-checked repair for malformed JSON. General application files and Git remain host-tool responsibilities. Implement only this contract, with no project-settings format selector, alternate-format readers, imports or compatibility migration. The executable, HTTP/MCP schema and examples implement this contract. CLI, HTTP/MCP and execution must share validation. Preserve omitted environment defaults, apply explicit overrides/unsets and reject dependency variable collisions. A validation pass does not establish readiness or approval.

Use file-based runtime storage as described in `docs/storage.md`. Ordinary readers support the current runtime format. Persisted runtime changes require explicit ordered Umzug startup migrations with original backups, validation and interruption/retry coverage. Preserve historical evidence and never silently reset data. Authored project settings remain the single fixed contract above. Do not reintroduce SQLite/Drizzle for normal runtime storage without a new requirement and decision.

## Tests and boundaries

Write tests before implementation and observe a real assertion failure. Do not treat process non-zero status or environment/collection errors as proof of functional red. Never silently weaken reviewed tests or claim unobserved results. Use the existing Vitest tests for the current server.

Use Red → Green → Refactor for testable behavior changes, including Integration
and Playwright acceptance paths. First observe the intended assertion fail on the
baseline, implement the smallest change that passes it, then refactor while keeping
the assertions and affected regression checks green. Preserve the command or run ID
and observed red/green results in task evidence. Tests written after implementation
do not establish TDD. Documentation and static configuration changes use relevant
checks without inventing a failing behavior test; visual-only changes still require
the actual-app captures above. Apply the same procedure in distributed plugin skills;
see [writing verification](docs/tests.md).

The retired Hurl implementation and skill were removed. Use the current server tests and Git history for historical context.

Read-only Git inspection and existing-checkout routing support source identity.
The host agent owns worktree creation, Git mutations, settings changes through CLI and publication.
Test execution provisions temporary Compose environments; general cleanup preserves
historical evidence and handles resources retained by older versions. Explicit viewer review actions request human execution approval; they do not establish
human acceptance of code changes. Preserve their capability and client trust boundaries.
Container declarations may validate but must not silently run without their requested
environment.

## Self-E2E through Redpact

For this repository's managed acceptance tests, follow `e2e/README.md`. Use the actual
working checkout in `redpact tests run --kind integration`, preserve the shared primary settings root, and verify
that the connected viewer lists the returned submission under that same worktree.
Do not substitute a clone/example or treat local unit-test output as submitted evidence.

## Collaboration

When useful for a substantial task, divide independent implementation, documentation
and test work among subagents with explicit file ownership and one checkout/evidence
identity. The parent integrates and reviews the combined result; delegation does not
replace verification. Trivial changes do not require parallel work.

## Commands

Use pnpm. Run server typecheck, tests/build, relevant CLI checks, and lint for executable changes. `pnpm --filter @redpact/server test` builds the server before testing its public CLI. Do not modify vendored UI components for unrelated work. Keep comments concise and explain reasons rather than restating code.

Use braces for control-flow bodies, avoid nested ternaries, and remove redundant `else` after early exits. Cognitive complexity above 15 is a review warning, not a commit blocker. Preserve evaluation order when simplifying branches, and split functions by responsibility rather than just to reduce the score. See `docs/development.md`.

## Publication destination

Use `dev` for local development and target development pull requests at `dev`.
Reserve `main` for npm publication and release tags. Promote verified changes from
`dev` to `main` when preparing a release, and create release tags on the verified
`main` commit. Do not use `main` for routine local development.

Publish product changes and pull requests to the public `wo658/redpact` repository.
A merge into `wo658/redpact-private` alone does not complete publication. Verify the
explicit GitHub repository and target branch before pushing or creating a PR.

## Releases

Follow the version, tag, naming and cadence policy in
[Development: Release policy](docs/development.md#release-policy).
Develop on `dev` and target development pull requests at `dev`. Promote verified
changes to `main` to request an automatic stable release. Every main push runs
version preparation, snapshot verification, immutable tagging and npm publication;
ordinary dev commits do not publish.

- Before preparing a release, inspect existing tags and published versions, choose
  the next version under that policy, and summarize changes since the prior release.
- Use `app/server/package.json` for the web/runtime product version. The private
  workspace root version is not the product version.
- Complete required executable, affected acceptance, documentation and installed
  package checks before release. Record the exact commit, version, validation and
  remaining limitations. Explain incompatible settings/API/storage changes and any
  required reset or manual action in English and Korean release notes.
- Tag the verified release commit using the exact `v<version>` name. Never move an
  existing published tag or replace published contents; corrections need a new version.
- Local builds and updates do not constitute publication. Perform tagging, pushing
  and publication within the user's authorized release scope. The current npm
  workflow prepares a stable version on main pushes, verifies that exact commit,
  tags it and publishes the same tarball through npm OIDC. Stable tag pushes also
  verify/publish; manual dispatch defaults to verification only and publishing retries
  require an existing stable tag ref. Tags containing `-` skip automatic publication. For a
  `-beta.N` package, verify an explicit npm prerelease dist-tag before publication:
  the current publish script does not select one automatically.

## Retained worktree locations

Use .codex/worktrees/ or another permanent project-owned directory for development
worktrees awaiting review or merge. Never infer /tmp or /private/tmp as a persistent
worktree convention from older registrations. Temporary test fixtures remain allowed.
