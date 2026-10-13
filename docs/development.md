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

A successful hook request is not publication confirmation: check the Vercel result
and the deployed source commit. Failed fetches, validation or builds do not publish
the new output. A missing hook secret fails the publication job explicitly. A
maintainer can set `REDPACT_DOCS_COMMIT` to a full SHA in the website build environment
for reproducible builds or a temporary pin; remove it to resume main tracking.

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

Tag the exact verified release commit. Ordinary PR/push CI remains unchanged; the
heavy distribution checks run on stable `v<version>` tags (or manual release dispatch).
The product workflow keeps the GitHub Release in draft until **both** native desktop
installation checks and the full npm installation matrix succeed. Neither publication
job may bypass these gates. The standalone manual npm workflow reuses the npm gate.

The [npm verification workflow](../.github/workflows/runtime-verification.yml) builds
one tarball, records its source commit, version and SHA-256, and retains it as an
Actions artifact. Linux x64, macOS ARM64/Intel and Windows x64 install that same file
with Node 24 and 26, a fresh npm cache/prefix and lifecycle scripts enabled. Checks
cover installed package identity, CLI startup, health, bundled viewer, MCP configure
and owned-process shutdown. Windows invokes the installed CLI JavaScript entry with
Node rather than the `.cmd` shim. These checks do not prove every Node 24+ version,
Docker execution, or registry download availability.

Only after all release checks pass do the publication jobs expose the draft desktop
release and publish the verified npm tarball through trusted publishing. The npm job
checks the artifact identity again and does not rebuild it. No candidate npm version
is published during verification. Registry availability must be checked after posting;
GitHub and npm publication are separate operations, not an atomic transaction. A failed
check leaves the release unpublished (a tag and draft may remain). Retry infrastructure
failures; source corrections require a new version/tag rather than moving a release tag.
The publish script does not automatically select an npm prerelease dist-tag for
`-beta.N`; prereleases require a separately reviewed channel. Local `publish:runtime`
checks only the local environment; use the Actions workflow for the full matrix.

The product snapshot and stable distribution tag is `v<version>`. Preview and legacy
artifact verification workflows retain `desktop-preview-v<version>`,
`desktop-platform-preview-v<version>` and `runtime-v<version>` where documented.

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
lockfile evidence. Preserve the bundled Testcontainers patch, locked Umzug graph (including the AJV
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
[desktop updater](../app/desktop/tools/local-update.ts),
[release workflow](../.github/workflows/npm-publish.yml).

## Public installation distribution

The public repository owns `install.sh`, `Formula/redpact.rb`, the Codex catalog at
`.agents/plugins/marketplace.json` and the Claude Code catalog at
`.claude-plugin/marketplace.json`. The Cursor catalog at `.cursor-plugin/marketplace.json` also reuses
`plugins/redpact`; Copilot can read the Claude-format catalog. Keep the three
plugin manifest versions aligned when publishing plugin changes. Plugin versions
are independent of the server/desktop version, and publishing a GitHub Release
does not replace the marketplace branch snapshot.
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


## Comparative pilot fixtures

`tools/pilot/fixture` is an isolated, in-memory Order Desk fixture for comparing
ordinary worktrees, shell HTTP calls to Redpact, and direct MCP. It does not test
DB persistence or migrations. `tools/pilot/tasks.json` defines the three Korean
acceptance tasks and separate edit boundaries. The baseline intentionally lacks
request quantity parsing, UI filtering and payment retries; its passing baseline
tests do not mean those tasks are solved. Experiment proposals and results belong
in the tracking issue, not in product documentation.

```sh
node --test tools/pilot/*.test.ts tools/pilot/fixture/test/*.test.ts
REDPACT_URL=http://127.0.0.1:54322 node tools/pilot/preflight.ts
node tools/pilot/metrics.ts /path/to/events.jsonl /path/to/metadata.json
docker compose -p tea17-fixture -f tools/pilot/fixture/compose.yaml up -d --build --wait
docker compose -p tea17-fixture -f tools/pilot/fixture/compose.yaml port app 3000
```

Use the actual connected runtime origin. Preflight discovers model-visible MCP tools
and HTTP routes without running tests or changing approval policy. Exit 2 means
required capabilities are missing; exit 1 means discovery failed. Exit 0 proves only
capability presence, not execution readiness, route equivalence or approval. An
optional output path writes a new JSON report and refuses to replace an existing one.
Do not substitute HTTP execution for missing MCP tools in a measured MCP condition.

Metrics consume Codex JSONL plus metadata containing `elapsedMs`, `exitCode`, and
optional `infrastructureError`. Missing usage is unknown, never zero; cached input
is part of total input. Maximum context occupancy and compaction count are unknown
unless independently instrumented. Preserve raw traces privately outside Git; they
may contain prompts, code and tool output. Development and evaluator costs must be
reported separately, including the coordinating parent when measured.

The Compose command is local fixture verification, not managed Redpact evidence.
The app has seeded orders with quantities 1, 2 and 3 and fresh per-process inventory.
`PAYMENT_FAILURES` and `PAYMENT_PERMANENT` configure its deterministic payment mock.
The ephemeral published port avoids a fixed host-port requirement. Retain inspection
environments while needed; remove only the owned fixture with the same Compose
project name and `down --volumes` when inspection is finished.

The single-task collector runs `node tools/pilot/measure.ts CONFIG.json`. Its JSON
requires absolute `cwd`, `promptFile`, and new `outputDirectory` paths, `condition`
(`A`, `B`, or `C`), an explicit `model`, `reasoningEffort`, and `timeoutMs`. C also
requires `redpactUrl` pointing to the connected `/mcp` endpoint. The collector uses
Codex workspace-write isolation by default (`approvalMode: "sandbox_only"`),
disables plugins and nested agents, and keeps authentication. When the user
explicitly authorizes automatic approval review, `approvalMode: "auto_review"`
uses `--approve-for-me` instead of `--sandbox workspace-write`. These CLI flags
are mutually exclusive; neither mode enables an approval bypass. User/project instruction and tool isolation must
still be audited before comparing conditions. It records monotonic elapsed time,
JSONL, stderr, process metadata and usage summary. Timeout does not prove descendant
or container cleanup. The batch coordinator below combines this collector with
independent candidate evaluation; merged-batch integration remains outside its scope.

The batch runner makes the child agents themselves the experimental subjects.
Each subject is a fresh, ephemeral `codex exec` process with its own context and Git
worktree, not a helper agent used to prepare the experiment. It receives one of the
same three tasks from the same frozen fixture commit. Within a condition, the three
tasks run concurrently. Conditions run sequentially in a seeded shuffled order on
each repetition, avoiding competition between conditions on the host.

Prepare a JSON configuration with these fields; paths must identify the actual host
and the model must be available to its Codex CLI:

```json
{
  "root": "/absolute/project/experiments/tea17-run-01",
  "model": "gpt-6.1-sol",
  "reasoningEffort": "medium",
  "approvalMode": "auto_review",
  "conditions": ["A", "B", "C"],
  "repetitions": 2,
  "seed": 17,
  "timeoutMs": 900000,
  "evaluationTimeoutMs": 120000,
  "redpactOrigin": "http://127.0.0.1:54322",
  "playwrightModule": "/absolute/node_modules/playwright/index.mjs",
  "httpGuideFile": "/absolute/redpact-checkout/tools/pilot/http-guide.txt",
  "environmentGuideFile": "/absolute/private/environment-guide.txt"
}
```

```sh
node tools/pilot/batch.ts prepare /absolute/private/config.json
node tools/pilot/batch.ts run /absolute/project/experiments/tea17-run-01/manifest.json
```

The example selects user-authorized automatic approval review. Omit `approvalMode`
or set it to `sandbox_only` to use the default explicit workspace-write sandbox.
Use `auto_review` only with the user's authorization; denied requests remain
blocked and must be reported in the captured trace, not retried through a bypass.
Keep the same approval mode for every A/B/C subject in a comparison. Child-process
exit, recorded executions and saved artifacts do not establish resource cleanup;
inspect retained containers and descendant processes independently.

`root` must be new and retained in a permanent project-owned location. `prepare`
creates the baseline repository, subject worktrees, private prompts, a frozen copy
of evaluator tests, and `manifest.json`; it does not launch development agents.
`repetitions` accepts 1–20, and `conditions` must contain unique A/B/C values.
`timeoutMs` bounds each subject and `evaluationTimeoutMs` bounds each evaluation.
For B, `httpGuideFile` is required. Use the supplied `tools/pilot/http-guide.txt`,
which documents the inspected server routes, payloads and approval limitations.
Check the connected runtime's OpenAPI contract before executing its operations;
replace the guide only when an intentionally selected runtime has a different contract. Do not guess API
routes or supply human approval endpoints as agent operations. `redpactOrigin` is
required for B/C and must identify the connected loopback HTTP runtime.

`run` checks clean baseline checkouts and the frozen evaluator before dispatch. For
B/C it discovers runtime capabilities, resolves the experiment primary settings root
with `configure describe`, authors the shared settings template there and validates
subject checkouts. Missing capabilities block dispatch; the runner neither updates
the runtime nor replaces MCP with HTTP. A-only runs do not require Redpact setup.
Validation alone does not grant execution approval or establish Docker readiness.

A subjects use direct Compose verification; B subjects use shell HTTP requests;
C subjects use Redpact MCP. All may use local unit tests while developing. Public
prompts disclose the UI selectors and control labels checked by the evaluator.
Evaluator files remain outside subject checkouts, and subjects are instructed not
to inspect other worktrees, prior traces, history branches or reference solutions.
This is instruction-based separation, not a security boundary preventing host reads.
Review raw traces and changed-file scope before making a causal comparison.
Scope checks read NUL-delimited Git paths so non-ASCII names, spaces and newlines
in evidence filenames do not become false scope violations.

`environmentGuideFile` is optional. When supplied, the runner appends its exact
contents to every subject prompt, identically across A/B/C. Record immutable Docker
image IDs, runner/browser fingerprints, cache policy and the shared execution
instructions there before preparing the baseline. The current browser protocol
pins Playwright 1.63.0 and Chromium 153.0.8010.12 on Linux arm64. Reuse the same
prewarmed runtime images across conditions, while creating fresh runner containers
and browser profiles for each execution. This measures development with warm
images and excludes initial dependency/browser installation cost. Model prompt
caching is not controlled; preserve observed cached-input token usage and disclose
that limitation rather than calling the experiment cache-free.

For direct A verification, the fixture includes `integration.ts` and `browser.ts`.
They accept the owned Compose network and an immutable `sha256:` Docker image ID,
copy the current test sources into a fresh container, and retain results plus
runner/browser fingerprints under `artifacts/`. They do not call Redpact. B/C use
the managed runtime with the same pinned runner images. Supply the appropriate
image IDs in the shared environment guide; do not substitute mutable image tags.
The direct browser helper takes explicit viewport dimensions: use 1440×900 and
390×844 for the pilot instead of relying on its defaults.

```sh
node integration.ts OWNED_COMPOSE_NETWORK IMMUTABLE_INTEGRATION_IMAGE_ID
node browser.ts OWNED_COMPOSE_NETWORK IMMUTABLE_BROWSER_IMAGE_ID http://app.redpact.test:3000 functional 1440 900
node browser.ts OWNED_COMPOSE_NETWORK IMMUTABLE_BROWSER_IMAGE_ID http://app.redpact.test:3000 functional 390 844
```

Worktree Playwright sources live in `ui-tests/worktree/`: `baseline.spec.ts` is the
public smoke, `task.spec.ts` is the subject's functional test, and `capture.spec.ts`
is the capture scenario. Shared settings select both baseline and task files for
the functional target, and the capture file for the capture target; both targets
have `scope: "worktree"`. The configured desktop viewport is 1440×900 and mobile
viewport is 390×844. Keep the independent evaluator's host, browser module and
browser version fixed across all candidates and record them separately: its host
browser is an assessment environment, not the subject's pinned Linux browser.
Runtime updates require separate authorization and preparation; the batch runner
only checks the connected runtime and never upgrades it during measurement.

After each batch, the runner snapshots each candidate and evaluates its assigned
task independently. `report.json` contains per-subject evidence, actual input,
cached-input and output token usage (missing usage remains `null`), task success
and test pass rates, and subject and batch elapsed times. Infrastructure errors do
not become functional failures or successful zero-test runs. Incomplete evaluation
keeps aggregate accuracy unknown while reporting observed outcomes separately.
Development costs include failed executions; evaluator time is recorded separately.
The deterministic coordinator has no model token cost; preparation assistants and
any human intervention are outside that recorded total and must be disclosed.
Transport compliance requires manual trace review, and resource cleanup requires
independent inspection. Reports do not establish merged-code correctness or completed
managed verification solely from passing independent acceptance tests. Evidence and
worktrees are retained; do not reuse a completed manifest as a fresh repetition.

Evaluator-only tests live in `tools/pilot/evaluation`. Set `PILOT_CHECKOUT` to the
absolute candidate fixture root and run `node --test tools/pilot/evaluation/*.acceptance.ts`.
The UI evaluator uses installed Playwright, or an explicit `PILOT_PLAYWRIGHT_MODULE`
module path. It checks Apply/Reset/Retry controls in English on the actual app.
The unchanged baseline is expected to fail task acceptance. Keep evaluator tests,
reference solutions and previous traces outside every development agent's checkout;
copy only the fixture when creating experiment repositories. Baseline tests that
assert intentionally missing behavior are preparation checks, not candidate
regression requirements. Validate evaluator red/green with a separate private
reference implementation before freezing a pilot. Managed runner templates are
separate from this independent evaluation path.

`fixture/settings.example.json` is a template, not active shared configuration.
Resolve the generated experiment repository's primary settings root with `configure
describe` before authoring its `.redpact/settings.json`; then validate that same
checkout. The fixture includes portable Vitest Integration steps and separate
Playwright functional/capture targets. These need their configured Redpact runners;
copying the template or passing local baseline checks does not establish managed
execution. The sample requires no additional product CLI: the B condition uses
HTTP, and the included CLIs prepare/check/measure the experiment only.

The functional Playwright target includes `baseline.spec.ts` and the subject-authored
`ui-tests/task.spec.ts`; prompts specify that filename. HTTP verification tests
are authored under `integration/` and use `APP_URL` in every condition.
