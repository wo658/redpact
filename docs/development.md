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
checks opt-in. To execute those checks too, prepare their artifacts and enable all
four switches. Run builds before tests; packaging rebuilds `dist`, which active
CLI and runner tests read. Serialize the full opt-in suite to limit Docker network
and memory pressure without disabling assertions:

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

The server and desktop share one product release version. Keep their package
manifests, Tauri configuration, Cargo manifest and the desktop package's Cargo lock
entry aligned in the same release change. Synchronization is currently manual;
the private workspace root version is not the product release number.

Tag the exact verified release commit. Building, installing locally, tagging and
publishing are distinct operations. The current npm workflow requires manual
dispatch and is not triggered by a version tag. Its publish script does not
automatically select an npm prerelease dist-tag for `-beta.N`; verify explicit
prerelease channel selection before publishing such a package.

The product snapshot tag is `v<version>`. Existing distribution workflows still use
`desktop-v<version>`, `desktop-preview-v<version>`,
`desktop-platform-preview-v<version>` and `runtime-v<version>` for their respective
artifacts. These channel tags do not replace the product snapshot tag; preserve the
workflow-specific tag validation and published download URLs.

## Runtime packaging and updates

| Command | Scope |
| --- | --- |
| `pnpm pack:runtime` | Build web/server and create the installable tarball |
| `pnpm test:package` | Install and verify that tarball outside this repository |
| `pnpm test:package:docker` | Add opt-in actual Docker package checks |
| `pnpm local:update` | Update the existing macOS development LaunchAgent installation |
| `pnpm local:update:plugin` | Update the installed personal Redpact Codex plugin |
| `pnpm local:update:all` | Development service, then plugin; separate sequential operations |
| `pnpm desktop:update` | Rebuild and replace the locally installed Tauri desktop app |
| `pnpm publish:runtime --dry-run` | Build/install-test and inspect a release without publication |
| `pnpm publish:runtime` | Publish the verified package with npm authorization |

Builds alone do not update the installed runtime. The development service and desktop
instance are separate. The plugin targets the desktop MCP endpoint on port 54321;
a development-service update must not rewrite that connection. The default server
port is 54318. Start a fresh client task/connection after plugin/schema changes.

The runtime package includes web assets, MCP resources, notices, runner files and
lockfile evidence. Preserve the bundled Testcontainers patch and licenses through
installed-package verification. Workspace privacy flags do not make the OSS source
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
[desktop updater](../app/desktop/tools/local-update.ts),
[release workflow](../.github/workflows/npm-publish.yml).

## Public installation distribution

The public repository owns `install.sh`, `Formula/redpact.rb`, the Codex catalog at
`.agents/plugins/marketplace.json` and the Claude Code catalog at
`.claude-plugin/marketplace.json`. Both catalogs reuse `plugins/redpact`.
See [installation](installation.md) for user commands and unsupported paths.

For a runtime release, run `pnpm test:package` and the required executable checks.
Upload that exact `dist/redpact-<version>.tgz` and its `SHA256SUMS` to the matching
`runtime-v<version>` GitHub release. Update the installer version, Formula URL and
checksum, installation examples and verification workflow together. Never replace
an existing version's artifact. Mark runtime releases as not latest, because the
desktop updater's `releases/latest` endpoint belongs to desktop releases.
After publication, run the `Public installation verification` workflow to install
from the real public URL on Linux x64, macOS arm64 and macOS x64, then check the CLI,
bundled viewer and MCP. Verify Homebrew and both plugin clients separately; these
checks do not prove Docker execution or MCP Apps card support in each client.
