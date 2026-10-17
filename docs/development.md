---
title: Development and documentation
description: Contributor checks, releases and the single documentation source of truth.
---

# Development and documentation

## One documentation source

`docs/*.md` and `docs/meta.*.json` are the only maintained product and implementation
content and navigation. The separate `redpact-web` repository owns the Next.js/Fumadocs
renderer, landing and demo. It reads this directory directly and publishes English
and Korean at `/en/docs/` and `/ko/docs/` in the same website build. This repository
has no documentation application. There is no content copy or synchronization command.

Guides explain user tasks; reference pages own precise contracts and implementation
rules. Link to the owning page instead of restating its contract. Repository READMEs
are short entry points and package/example instructions. `AGENTS.md` is the agent's
work policy. License, governance and executable skill instructions keep their own
purposes; they are not parallel product manuals.

## Required maintenance in every change

1. Identify affected pages before implementation. Update the owning page in the
   same change whenever behavior, defaults, API/settings, UI navigation, constraints
   or commands change. A task is incomplete while its documentation describes old behavior.
2. Update English and Korean together, including titles, descriptions, navigation,
   examples and links. For code-only refactoring with no documentation impact,
   state the reason in the PR/completion report; do not invent a documentation edit.
3. Describe current implemented behavior. Record limitations next to the feature.
   Put proposals in issues/PR discussions and execution/merge evidence in the task/PR.
   Historical decisions are recoverable through Git, not appended current-state journals.
4. Reuse an existing topic before creating a page. Every new page must render on the
   site, appear in both navigation files and have a complete translation. Do not
   add hidden documents, generated content copies or a second manual.
5. Run the documentation checks and report verification honestly. Tests can check
   links and language presence; reviewers must still check factual and translation accuracy.

Use lowercase hyphenated stable slugs. English is `name.md`, Korean is `name.ko.md`.
Both have `title` and `description` frontmatter. `meta.en.json` and `meta.ko.json`
list the same page IDs. Use relative Markdown links between pages; the renderer keeps
the selected language. Links beginning `../` open repository source on GitHub and
may lag unpushed local edits. Use stable shared heading anchors for cross-locale links,
or link the page when heading IDs differ. Do not maintain copied HTTP/JSON schemas;
link the generated API or `configure describe` and document semantics here.

## Local setup and checks

Use Node 24+ and pnpm. Install with `pnpm install --frozen-lockfile`; `pnpm prepare`
enables tracked hooks when an install skipped scripts. Before executable changes finish:

```sh
pnpm --filter @redpact/server typecheck
pnpm --filter @redpact/server test
pnpm --filter @redpact/web test
pnpm --filter @redpact/web build
pnpm docs:check
pnpm lint
```

The server test script builds before its public CLI tests. Run affected acceptance
tests as well; default server tests do not prove real Docker behavior. For managed
self-E2E, follow the [repository procedure](../e2e/README.md), use the actual checkout,
preserve shared settings, and confirm the returned submission in that worktree's viewer.
The Docker build context excludes generated `.source` and `.next` directories so
host-specific website paths and caches do not enter the runtime image.
Observe a real assertion failure before implementation; collection/environment errors
are not a functional red. Do not weaken reviewed assertions or claim unobserved runs.

The default server suite leaves Docker, installed-package and actual-application
checks opt-in, including actual Integration runner, source-integrity, redaction and
resource-limit adapter tests. These tests require a host Docker daemon; managed Unit
containers do not mount that daemon. To execute those checks too, prepare their artifacts and enable all
four switches. Run builds before tests; packaging rebuilds `dist`, which active
CLI and runner tests read. Serialize the full opt-in suite to limit Docker network
and memory pressure without disabling assertions:

The managed Unit image builds the viewer before running the server suite because
runtime packaging tests require the real web output.

```sh
pnpm pack:runtime
docker build -f e2e/Dockerfile -t redpact-test-app:current .
REDPACT_DOCKER_TESTS=1 REDPACT_SELF_UNIT_CONTAINER_TEST=1 \
REDPACT_PACKAGE_TEST=1 REDPACT_APPLICATION_IMAGE=redpact-test-app:current \
pnpm --filter @redpact/server exec vitest run --maxWorkers=1
```

Biome requires braces, avoids nested ternaries and redundant else after early return,
and warns above cognitive complexity 15. Preserve evaluation order and observable
behavior when simplifying. Split by responsibility, not merely to reduce the score.
Lint excludes retained checkouts under `.worktrees/`; run checks from each checkout's own root.
Use concise reason comments, English identifiers and implementation copy. Submitted
acceptance scenarios follow the user's language as specified by `AGENTS.md`.

## CI scope

Automatic application CI runs one Ubuntu/Node 24 job for relevant pull requests and
main pushes: lint, documentation content checks, server typecheck, web build (including
TypeScript checking), server build/tests and web tests. It targets the supported web
and server packages explicitly, without a separate Docker job or OS/Node matrix.
Docker and affected actual-application checks remain available for targeted local
verification; a green CI result does not claim they ran.

The [App Page Plugin workflow](../.github/workflows/plugin-verification.yml) is
manual-only. Its packaging and npm/pnpm browser checks remain available before
plugin publication, without running on every web pull request. Documentation CI and
its main-branch website deployment request remain independent of application CI.
Runtime npm publication is also manual and uses the single-environment artifact
verification described below.

## Documentation verification responsibilities

Contributors run `pnpm docs:check` for documentation changes and update English and
Korean together. Public PR CI runs the same content checks. Neither requires access
to the private `redpact-web` repository. Content checks do not prove rendering or
translation accuracy.

Before merging documentation changes, a maintainer with renderer access runs
`pnpm docs:build` against the proposed checkout and records the checked revision,
command and result in the PR. For renderer or navigation changes, the maintainer
also runs preview and actual-browser checks in both languages at desktop and mobile
sizes. Rendering failures remain unresolved until fixed; lack of renderer access
is not a contributor failure. The build command still fails when the renderer is
unavailable rather than reporting a skipped build as success.

## Automatic website publication

The private `redpact-web` renderer tracks this repository's `main`. When the
Documentation verification workflow succeeds on main, it requests a website build
through the `REDPACT_DOCS_DEPLOY_HOOK` Actions secret. Maintainers configure that
secret with a Vercel Deploy Hook for the website repository's main branch. Pull
requests verify content without requesting production deployment. The workflow can
also be manually dispatched on main to retry the publication request.

Deployment requests run only for pushes or manual dispatches on `wo658/redpact`
main; forks skip the deployment job. Store the hook URL only in Actions secrets,
never in source or logs. Public readers and clones cannot access the secret value,
but secrets do not hide it from maintainers who can modify and run workflows with
secret access. The hook requests a deployment without granting access to the
private website repository.

Each website build resolves public main once, runs the canonical content checks
and renderer checks, then builds English and Korean from that same checkout. No
content is copied into the website repository. The build logs and deployed
`/docs-source.json` record the actual source commit. A newer main commit may be
included when changes arrive before the build fetches its source.

A successful hook request is not publication confirmation. The same deployment job
runs `node tools/docs/publication.mjs` without installing dependencies. It polls the
production `/docs-source.json` with cache-busting requests, up to 30 observations
10 seconds apart with an approximately eight-minute deadline and ten-second HTTP
timeouts. The entire job has a twelve-minute limit. The marker must identify this
repository and main, with either the requested SHA or a descendant reachable from
current public main. Git ancestry checks allow a newer main build to include several
consecutive updates without falsely failing an older request. Unrelated or older
commits never satisfy the check.

Both `/en/docs/` and `/ko/docs/` must also return successful HTML responses. CI then
records requested/deployed SHAs and the production marker URL in its job summary.
To audit a publication, open the deployment job summary and compare its deployed SHA
with the live `/docs-source.json`; later deployments may advance the live marker.

These checks confirm production source identity and route availability, not visual
layout or translation quality. Deployment jobs remain serialized, including their
verification, and each hook requests current main rather than an older pinned source.
This does not prevent a later external deployment or manual rollback.

A stale marker, failed fetch or unavailable language route is retried within the
bound; exhaustion fails CI with the last observed problem. A missing hook secret
or failed hook request fails explicitly. Retry failed jobs or manually dispatch the
workflow on main after fixing the Vercel failure. A maintainer can set
`REDPACT_DOCS_COMMIT` to a full SHA in the website build environment for reproducible
builds or a temporary pin; remove it to resume main tracking. A pin older than the
requested commit will fail publication verification.

## Documentation preview

The content-only `pnpm docs:check` works in this public repository without access to
`redpact-web`. It verifies translation/navigation coverage, page metadata and relative
file links. Rendering requires a checkout of the separate website and its installed
dependencies. The root commands below delegate to that website, passing this checkout's
`docs/` as `REDPACT_DOCS_DIR`; they never copy content.

```sh
# Default website location: ../redpact-web. Set an absolute path for worktrees.
export REDPACT_WEB_ROOT=/path/to/redpact-web
pnpm docs:dev
# http://127.0.0.1:4310/ko/docs/ or /en/docs/
pnpm docs:build
pnpm docs:preview
pnpm docs:test:preview
```

Within `redpact-web`, set `REDPACT_DOCS_DIR` to an absolute documentation directory
(default `../redpact/docs`) and run `pnpm docs:check`, `pnpm docs:build` and
`pnpm docs:preview`. Preview uses Python 3 to serve the static `out/` directory.
The website owns renderer tests and browser checks for routes, anchors, locale
switching, search and responsive navigation. Search runs in the browser against
an exported bilingual index, so the website does not require a search server.
The full website build includes landing, demo and docs; `docs:build` builds the
Next.js pages and requires existing demo assets only when verifying demo behavior.
A local build or preview does not publish; hosting must serve the generated website
and return 404 for missing paths. Fumadocs owns the documentation shell and page layout.
Read the installed Next.js guidance before modifying the renderer.

Docker build contexts exclude the documentation renderer’s generated `.next`,
`.source` and TypeScript cache so host-specific paths are regenerated in containers.

## Release policy

Redpact uses `0.x.y` product versions during beta, with `Beta` as a separate
user-facing label. A normal beta-period release does not need a `-beta.N` suffix.
These are Redpact's pre-1.0 conventions within [Semantic Versioning](https://semver.org/):

| Change | Version example |
| --- | --- |
| Bug fixes or small usability improvements | `0.1.0` → `0.1.1` |
| Meaningful new functionality | `0.1.3` → `0.2.0` |
| Incompatible settings, API or storage changes | `0.2.4` → `0.3.0`, with explicit change notes |
| Validation builds for a specific upcoming release | `0.3.0-beta.1` → `0.3.0-beta.2` → `0.3.0` |
| Stable core functionality and compatibility policy | `1.0.0` |

Choose the largest applicable increment for the release; reset patch to zero when
incrementing minor. Compatibility changes during `0.x` require a minor increment
and notes describing affected users, resets and manual actions. They do not imply
automatic migration support. Published versions and tags are immutable.

Use these naming conventions when presenting releases:

- Product display: `Redpact 0.2.0 · Beta`.
- Git tag: `v0.2.0`; a validation build uses `v0.3.0-beta.1`.
- Release title: `Redpact v0.2.0 — Execution result comparison`.
- Diagnostic identification: product version plus short commit SHA.

Target one release per week when verified changes are ready, with important bug
fixes released as needed. Bump versions when distributing verified changes, not
for every commit or merely because a week elapsed. This cadence is policy, not an
automated schedule. Release notes describe changes, verification, known limitations
and required user actions in English and Korean.

Supported distribution consists of the npm/pnpm web runtime and Plugins. The product
version belongs to `app/server/package.json`; native desktop manifests do not require
synchronization. Desktop release workflows have been removed. Tag the verified commit
with `v<version>` and manually dispatch the [npm workflow](../.github/workflows/npm-publish.yml).
Pushing a tag does not publish npm packages.

The [npm verification workflow](../.github/workflows/runtime-verification.yml) runs
one Ubuntu/Node 24 job. It builds and installation-tests one tarball, runs server
and web tests, records its source commit, version and SHA-256, and retains it as an
Actions artifact. There is no OS/Node installation matrix. Other host environments,
Docker execution and registry download availability are not established by this CI.

Only after all runtime release checks pass does the npm job publish the verified
tarball through trusted publishing. The npm job
checks the artifact identity again and does not rebuild it. No candidate npm version
is published during verification. Registry availability must be checked after posting;
GitHub and npm publication are separate operations, not an atomic transaction. A failed
check leaves the release unpublished (a tag and draft may remain). Retry infrastructure
failures; source corrections require a new version/tag rather than moving a release tag.
The publish script does not automatically select an npm prerelease dist-tag for
`-beta.N`; prereleases require a separately reviewed channel. Local `publish:runtime`
checks only the local environment; Actions uses the Ubuntu/Node 24 baseline.

The product snapshot tag is `v<version>`. Preserve historical desktop tags and published assets.

## Runtime packaging and updates

| Command | Scope |
| --- | --- |
| `pnpm pack:runtime` | Build web/server and create the installable tarball |
| `pnpm test:package` | Install and verify that tarball outside this repository |
| `pnpm test:package:docker` | Add opt-in actual Docker package checks |
| `pnpm local:update` | Update the existing macOS development LaunchAgent installation |
| `pnpm local:update:plugin` | Update the installed personal Redpact Codex plugin |
| `pnpm local:update:all` | Development service, then plugin; separate sequential operations |
| `pnpm publish:runtime --dry-run` | Build/install-test and inspect a release without publication |
| `pnpm publish:runtime` | Publish the verified package with npm authorization |

Builds alone do not update installed runtimes. The CLI defaults to port 54318,
HTTP agent plugin examples use 54321, and the App Page Plugin uses 54322. Instance
data and update ownership remain separate. Reconnect the host after Plugin/schema changes.

The runtime package includes web assets, notices, runner files and
lockfile evidence. The pinned `fs-native-extensions` package and its native prebuilds
are bundled for the common runtime writer guard; verify them through the installed
package check before release. Preserve the bundled Testcontainers patch, locked Umzug graph (including the AJV
security override), and licenses through installed-package verification. Packaging
retains workspace overrides in its staging install; consumers receive the bundled
graph because they do not inherit workspace overrides. The macOS-only optional
`fsevents` dependency is bundled with its upstream prebuilt binary and license, including
when packaging on Linux. This avoids the registry metadata that incorrectly requests
`node-gyp rebuild` without a `binding.gyp`; consumer lifecycle scripts stay enabled. Workspace privacy flags do not make the OSS source
private. Publishing needs a fresh package version and registry authorization;
packing or previewing does not publish, push Git or create a release tag.

Local updates stage a unique release, smoke-test it before switching, check active
work, preserve prior code and verify rollback on failure. Rollback restores code,
not runtime data compatibility. Never remove a live/unknown writer lock or prune
unrelated Docker resources. Old releases remain until explicitly managed.
The opt-in `redpact.autoUpdate` Git setting can invoke service/plugin updates after
a clean commit; it does not replace test verification or update the desktop app.

Implementation: [runtime packaging](../app/server/tools/pack-runtime.mjs),
[local updater](../app/server/tools/local-update.ts),
[release workflow](../.github/workflows/npm-publish.yml).

## Public installation distribution

Public distribution supports only the npm/pnpm web runtime and Plugins. Homebrew,
shell installers and native desktop distribution workflows have been removed.
Source builds and Docker Compose are contributor tools, not additional product channels.

The Codex catalog `.agents/plugins/marketplace.json` installs a pinned version of
`@wo658/redpact-plugin` from npm. Claude and Cursor catalogs retain their HTTP Plugin.
App Page Plugin versions are independent of runtime and HTTP Plugin versions.

In `examples/sidebar-app`, `pnpm pack:plugin` bundles macOS arm64 Node, npm, pnpm,
the full web viewer, MCP companion and skills. Run `pnpm test`, `pnpm typecheck`,
`pnpm test:package`, and the actual installation browser checks for npm and pnpm.
`dist/plugin-artifact.json` records the source commit, version and tarball SHA-256.
Publish that verified tarball with `npm publish <tarball> --access public`, verify
registry installation, then update the catalog pin. Never replace a published version.
Plugin installation runs no lifecycle scripts; runtime install/start remain explicit
in-app actions. Actual sidebar discovery in the host is a separate check from the
browser harness.

See [installation](installation.md) for user commands, host and platform limitations.
