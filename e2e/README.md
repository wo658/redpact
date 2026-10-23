# Redpact self-E2E

These acceptance tests exercise the built Redpact application through real HTTP,
MCP, Git worktrees, filesystem events, and persisted submissions. They do not import
server Core or rerun the unit-test suite. Nested Docker provisioning inside the target application is outside this suite's
coverage. Browser probes of exact execution source, output, images and approval run as
Playwright functional tests through the separate runner. The application image contains
no installed browser or Playwright test runtime.

## Run through the connected Redpact

1. Use the absolute checkout being developed. Keep that path throughout setup,
   `redpact tests run --kind integration`, result lookup, and viewer verification; do not move the tests to an
   example, clone, or a second server just to make execution work.
2. Call `redpact settings describe` and `redpact settings get` with
   `--scope project --path /absolute/checkout`. Read the live schema, roots and revision.
3. Apply the values from `e2e/settings.example.json` using `redpact settings patch`
   with that scope/path and `--revision REVISION --patch-stdin` (or `--create` for
   absent settings). Preserve unrelated settings and test env. Do not read or edit
   project/runtime JSON files directly.
   This file is a setup example, not a second runtime settings format. Linked
   checkout overrides are unsupported. Compose/test paths resolve in the execution
   checkout, so that checkout must contain this directory.
4. Use `redpact projects connect --path /absolute/checkout` if the primary project
   is not connected. Preserve other entries and approval policy. Verify the binding
   with `redpact workspace status --path /absolute/checkout` on that same instance.
5. Call `redpact settings validate --scope project` with the checkout path. The discovered bundle must include
   `target.ts`, `worktree-evidence.test.ts`, `chat-context.test.ts`, `host-boundaries.test.ts`,
   and `agent-cli.test.ts`.
6. Call `redpact tests run --kind integration --path /absolute/checkout` with
   `--test worktree-evidence.test.ts --test chat-context.test.ts --test host-boundaries.test.ts --test agent-cli.test.ts`.
   Honor any Ask approval. Use a fresh
   environment after application changes. Read `redpact runs show --kind integration --id ID` until terminal.
7. In the CLI envelope's `data`, verify `path` is the requested checkout and
   `worktreeId` matches its observed binding. `redpact submissions list --path PATH`
   must contain `identity.submissionId`, and `redpact runs list --path PATH` must
   contain the execution. Open its `reviewPath` in the connected viewer, or use
   `redpact open --kind integration --id ID` for that exact execution.
   Confirm the recorded submission. Report run and environment IDs, actual case
   results, and that server's origin.

Do not copy run records between projects or servers. A local `pnpm test` result
alone does not create a Redpact submission. Opening the full app without an execution link must retain project management and test catalogs; exact review links must remain bound to their recorded worktree.

## Environment and extension

`e2e/compose.yaml` builds the actual server and viewer from the selected checkout.
The target has its own `/tmp/redpact-e2e-state`; the installed controlling service is
independent. The fixture explicitly sets `REDPACT_GIT_MAX_BUFFER_MIB=4` to exercise
configured output-limit recovery with small commits; the product default remains 128 MiB.
Docker and Compose are required on the controller host. Git and pnpm are
installed in the target image. No host Docker socket or host runtime data is mounted.

Redpact supplies `REDPACT_CONNECTIONS_FILE`. The `tests/target.ts` helper uses its
consumer-specific addresses for HTTP/MCP requests and the disposable fixture endpoint
described below. No Docker CLI or socket is required inside either runner.

Add named `test(...)` cases under `e2e/tests`, using only declared test dependencies,
Node primitives, and helpers within that directory. Exercise public operations and
assert returned behavior, target identity, and durable evidence. Keep fixtures in the
managed container. Avoid hidden `/private/tmp` drivers, fixed host ports, internal
service mocks, copied runtime IDs, and test files importing repository internals.
Update the explicit `tests` list when adding files, or omit it to run all cases.

The self-E2E setup regression in `app/server/test/self-e2e-settings.test.ts` validates
the example against the real settings/Compose reader and discovers its acceptance
scenarios. The regular server suite remains independent of Docker self-E2E execution.
Typecheck the portable bundle with
`pnpm --filter @redpact/server exec tsc -p ../../e2e/tsconfig.json`.
Retained environments can be inspected in the Environment screen or through its API. Manual environments can be stopped; test environments retain automatic cleanup without a public stop route.

## Actual application verification

`ui-tests/project/tests` verifies the actual full app and web review links returned by MCP. Cover project/worktree navigation, files and diffs, Git, test catalogs, manual environments, dependencies and settings, including desktop/mobile controls and error states. Opening the full app without a record must show normal navigation or project connection. Exact execution links must preserve the recorded identity and explicit human approval boundary inside that app.

Keep chat-context and approval checks alongside the full application coverage. Verify captured inputs, both Integration approval gates, Unit/Playwright request approval, stale-input rejection, cancellation non-exposure and live updates. Verify that runtime MCP advertises no inline card resources or approval tools.

Use `redpact tests run --kind playwright` with the actual checkout and the declared functional or capture target. Target patterns are relative to `ui-tests`. Capture completion alone is not visual approval: inspect desktop/mobile images and identify seeded record fixtures as fixtures, not application execution evidence. The companion's real MCP bridge needs its own lifecycle checks.

The disposable image also builds the shipped MCP viewer entry as `embedded-viewer.html`.
The embedded sidebar browser tests initialize that entry through an explicit simulated
host in a parent iframe, with viewer requests and live events forwarded to the actual
disposable HTTP/SSE server. This verifies embedded UI initialization and manual
navigation; it does not establish compatibility with the real ChatGPT host or the
plugin installation and private capability lifecycle.

The native runner checks described in [development](../docs/development.md) cover actual capture collection, delayed/path attachments, crops, high-DPI pages and artifact persistence. They do not create a connected Integration submission.

`host-boundaries.test.ts` must verify restored management HTTP controls while preserving the narrower model-facing MCP scope. Configuration checks use the fixed settings contract and shared validation; reads must not silently repair invalid authored content. `runtime-migrations.test.ts` verifies original backups, retained evidence, interrupted migration recovery and rejection of unsupported history through the real CLI.

## Container-runner fixture transport

`target.ts` uses the consumer-specific connection manifest to reach the disposable
image's fixture service on port 54319. It needs no Docker CLI, Docker socket or host
filesystem mount. The fixture endpoint sends JSON input through stdin to avoid operating-system argument size limits, while preserving `process.argv[1]` for fixture scripts. It executes bounded setup commands only inside
that image and rejects browser-origin requests. It is not included in product packages
and must never be deployed as a normal server. Browser verification uses the separate
Playwright entry; the fixture service does not launch browsers.

The fixture image exposes the real application on 54318 with its unchanged loopback
host/origin admission. Its test-only UI deployment on 54320 accepts the reserved
`app.redpact.test` origin and forwards same-origin requests to the loopback upstream.
The fixture closes upstream streams when the browser disconnects.
Cross-origin requests remain rejected. Current Playwright setup uses 54320; an older
controller using loopback 54318 can still inspect the same application. This deployment
fixture does not establish production proxy, TLS or external API compatibility.

Browser scenarios that exercise Clipboard or Web Crypto explicitly trust only the
disposable `http://app.redpact.test:54320` origin through full Chromium channel launch options; the headless shell does not
honor this origin-trust option.
This test-only setting does not change the product HTTP admission rules or browser
security settings outside that runner. MCP review-link scenarios open the actual connected web review screen.
