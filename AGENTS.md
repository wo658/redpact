# Agent instructions

## Read first

Read `docs/architecture.md`, `docs/settings-reference.md`, and `docs/development.md`.
The website content in `docs/` is the sole maintained product and implementation
reference. Read the relevant feature page before changing its behavior.

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

For every UI or screen change, review the relevant Playwright tests and verify the changed screen through the actual application. Run functional tests for affected navigation, controls, states, and responsive behavior; add or update meaningful coverage when missing. For layout or styling changes, also capture and inspect the relevant desktop and mobile states. Browser tools and screenshots are authorized for this verification without a separate request. Static HTML/CSS checks, component tests, and builds supplement this evidence; they do not replace it. Report any unverified state or execution blocker explicitly. Read `docs/frontend.md` before UI work. The default `app/web/` entry is the connected viewer; separate demo surfaces do not specify backend behavior.

## Implementation

Use TypeScript and Hono in `app/server`, with interfaces/workflows/core/adapters boundaries following Functional Core, Imperative Shell. HTTP, MCP and internal application triggers share use cases in `src/workflows`, including single-feature queries. Keep handlers close to Hono routes; transport may reuse pure schemas and formatters but must not implement use cases through adapters. Workflows own I/O, lifecycle sequencing, concurrency, recovery and cleanup; simple reads may directly return adapter results without a forwarding Core function. Core owns pure policies, calculations and schemas, receives data rather than effectful service capabilities, and must not import workflows, adapters or interfaces. Supply time and random identifiers from the Shell. Adapters must not import workflows or interfaces. Wire concrete dependencies in `main.ts`. Avoid controller classes, DI containers, generic storage engines and speculative wrappers; reuse adopted OSS and Node standard primitives.

The accepted settings contract is defined in `docs/configuration.md` and
`docs/settings-reference.md` (scoped WT overrides and reviewed merge promotion): one `.redpact/settings.json`, dependency-keyed modes with optional `services` and target-specific `env`, and separate execution selection. The agent writes files directly after MCP `configure describe`, then calls `configure validate`; no CLI registration is needed. Implement only this contract, with no project-settings format selector, alternate-format readers, imports or compatibility migration. The executable, HTTP/MCP schema and examples implement this contract. HTTP/MCP and execution must share validation. Preserve omitted environment defaults, apply explicit overrides/unsets and reject selected variable collisions. A validation pass does not establish readiness or approval.

Use file-based runtime storage as described in `docs/storage.md`. This is an unreleased product: support only the current runtime format, with no backward readers, imports or compatibility migrations. Development data may be reset when the format changes. Do not reintroduce SQLite/Drizzle for normal runtime storage without a new requirement and decision.

## Tests and boundaries

Write tests before implementation and observe a real assertion failure. Do not treat process non-zero status or environment/collection errors as proof of functional red. Never silently weaken reviewed tests or claim unobserved results. Use the existing Vitest tests for the current server.

The retired Hurl implementation and skill were removed. Use the current server tests and Git history for historical context.

Read-only Git inspection, existing-worktree routing, and managed worktree creation are implemented. Creation uses a separate native Git adapter with durable retry/recovery records. Test execution provisions temporary Compose environments. Project Container separately owns manual inspection environments; execution cannot reuse them. MCP Apps request approval and credential inputs are implemented; they do not establish human acceptance of code changes. Preserve their capability and client trust boundaries. Container declarations may validate but must not silently run without their requested environment.

## Self-E2E through Redpact

For this repository's managed acceptance tests, follow `e2e/README.md`. Use the actual
working checkout in `run_tests`, preserve the shared primary settings root, and verify
that the connected viewer lists the returned submission under that same worktree.
Do not substitute a clone/example or treat local unit-test output as submitted evidence.

## Commands

Use pnpm. Run server typecheck, tests/build, relevant CLI checks, and lint for executable changes. `pnpm --filter @redpact/server test` builds the server before testing its public CLI. Do not modify vendored UI components for unrelated work. Keep comments concise and explain reasons rather than restating code.

Use braces for control-flow bodies, avoid nested ternaries, and remove redundant `else` after early exits. Cognitive complexity above 15 is a review warning, not a commit blocker. Preserve evaluation order when simplifying branches, and split functions by responsibility rather than just to reduce the score. See `docs/development.md`.

## Publication destination

Publish product changes and pull requests to the public `wo658/redpact` repository.
A merge into `wo658/redpact-private` alone does not complete publication. Verify the
explicit GitHub repository and target branch before pushing or creating a PR.

## Releases

Follow the version, tag, naming and cadence policy in
[Development: Release policy](docs/development.md#release-policy).
Treat a release as a verified product snapshot, not a version bump on every commit.

- Before preparing a release, inspect existing tags and published versions, choose
  the next version under that policy, and summarize changes since the prior release.
- Keep the server and desktop product versions aligned in one release change:
  `app/server/package.json`, `app/desktop/package.json`,
  `app/desktop/src-tauri/tauri.conf.json`, `app/desktop/src-tauri/Cargo.toml`,
  and the desktop package entry in `Cargo.lock`. The private workspace root's
  placeholder version is not the product version. Version synchronization is
  currently manual; do not assume a bump command updates every file.
- Complete required executable, affected acceptance, documentation and installed
  package checks before release. Record the exact commit, version, validation and
  remaining limitations. Explain incompatible settings/API/storage changes and any
  required reset or manual action in English and Korean release notes.
- Tag the verified release commit using the exact `v<version>` name. Never move an
  existing published tag or replace published contents; corrections need a new version.
- Local builds and updates do not constitute publication. Perform tagging, pushing
  and publication within the user's authorized release scope. The current npm
  workflow is manually dispatched; pushing a tag does not trigger it. For a
  `-beta.N` package, verify an explicit npm prerelease dist-tag before publication:
  the current publish script does not select one automatically.

## Retained worktree locations

Use .codex/worktrees/ or another permanent project-owned directory for development
worktrees awaiting review or merge. Never infer /tmp or /private/tmp as a persistent
worktree convention from older registrations. Temporary test fixtures remain allowed.
