# Redpact self-E2E

These acceptance tests exercise the built Redpact application through real HTTP,
MCP, Git worktrees, filesystem events, and persisted submissions. They do not import
server Core or rerun the unit-test suite. Nested Docker provisioning inside the target application is outside this suite's
coverage. A few embedded browser probes exercise public UI behavior; maintained
Playwright functional tests and captures use their separate execution entry.

## Run through the connected Redpact

1. Use the absolute checkout being developed. Keep that path throughout setup,
   `run_tests`, result lookup, and viewer verification; do not move the tests to an
   example, clone, or a second server just to make execution work.
2. Call `configure describe` and `configure inspect` with that path. Read the live
   schema and the returned `rulesRoot`, `projectRoot`, and observation settings path.
3. Merge the values from `e2e/settings.example.json` into the one
   `<rulesRoot>/.redpact/settings.json`, preserving unrelated settings and test env.
   This file is a setup example, not a second runtime settings format. Linked
   checkout overrides are unsupported. Compose/test paths resolve in the execution
   checkout, so that checkout must contain this directory.
4. Ensure the primary project is in the connected instance's observed `projects`.
   Preserve other entries and approval policy. Verify the project root and selected
   checkout through that same instance's `/api/projects`, tracking, and worktrees
   endpoints.
5. Call `configure validate` with the checkout path. The discovered bundle must include
   `target.ts` and `worktree-evidence.test.ts`.
6. Call `run_tests` with that same path and
   `tests: ["worktree-evidence.test.ts"]`. Honor any Ask approval. Use a fresh
   environment after application changes. Read `get_run` until terminal.
7. Verify `run.target.projectRoot` is the requested checkout. On the connected
   server, `/api/submissions?worktreeId=<run.target.worktreeId>` must contain
   `run.submissionId`, and `/api/runs?submissionId=<run.submissionId>` must contain
   the run. This is the data the selected worktree's Tests view reads. Report run and
   environment IDs, actual case results, and that server's origin.

Do not copy run records between projects or servers. A local `pnpm test` result
alone does not create a Redpact submission. "No test submissions" means this selected
worktree has no recorded bundle; it does not classify tests as unit or E2E.

## Environment and extension

`e2e/compose.yaml` builds the actual server and viewer from the selected checkout.
The target has its own `/tmp/redpact-e2e-state`; the installed controlling service is
independent. Docker and Compose are required on the controller host. Git and pnpm are
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
Retained environments can be inspected and explicitly stopped in the web Environment screen.

## Actual application UI captures

`ui-tests/project/captures/application.spec.ts` and `dependencies.spec.ts` exercise this
repository's real app using page-state screenshots and named Korean checkpoints. The shared settings example includes
the Playwright app service and loopback port. Its target patterns are relative to
`ui-tests`: `project/captures/**/*.spec.ts` for captures and
`project/tests/**/!(product-demo).spec.ts` for functional scenarios. The separate
`demo` target selects `project/tests/product-demo.spec.ts`. All three targets use
project scope.
Use the advertised capture HTTP action
on the connected instance; these sources are separate from `run_tests`.

Native adapter verification is available after building this checkout's app image:

```sh
docker build -f e2e/Dockerfile -t redpact-playwright-app:current .
REDPACT_APPLICATION_IMAGE=redpact-playwright-app:current pnpm --filter @redpact/server exec vitest run test/playwright-application.test.ts
```

Set `REDPACT_CAPTURE_EVIDENCE_DIR` to an absolute temporary output directory to retain
that native check's source, screenshots, video and trace. It verifies browser execution
and artifact persistence, and does not create a connected integration submission.

`playwright-purpose.test.ts` verifies purpose discovery, current source visibility
before execution, catalog boundaries and rejection of overlapping target patterns
through the actual HTTP API. The native application check executes capture and
functional targets separately and verifies that successful functional execution
produces no PNG screenshots.

`environment-inputs.test.ts` covers literal environment values, init credential card
metadata and distinct value/status HTTP reads through the actual application.
It does not establish that the current MCP host renders the input card.

`dependency-topology.test.ts` verifies fixed dependency definitions, application-service
relationships, and revision-preserving rejection of unsupported kinds through HTTP and MCP.

`capture-viewport.test.ts` seeds isolated capture records, verifies their public API
readback, and runs Playwright functional assertions against that same application
container's real Mobile toggle. It uses Chromium installed in the disposable fixture image and reports browser assertions inside the managed Integration result.
It does not claim those seeded PNGs were application captures. Actual automatic
collection, delayed/path attachments, crops and high-DPI pages are independently
verified by `REDPACT_DOCKER_TESTS=1` and `test/playwright-docker.test.ts`.

`dependency-mode-names.test.ts` checks all four fixed kinds, rejection of managed
services on external dependencies, and rejection of retired execution selection input.
Fixture services are declarations, not evidence of actual PostgreSQL or remote execution.

`runtime-migrations.test.ts` starts the real CLI with disposable legacy records,
checks HTTP readback, exact original backups and restart stability, and verifies
that missing captured choices and future migration history leave inputs intact.
It also exercises restart after a record was converted but completion was not recorded.

## Container-runner fixture transport

`target.ts` uses the consumer-specific connection manifest to reach the disposable
image's fixture service on port 54319. It needs no Docker CLI, Docker socket or host
filesystem mount. The fixture endpoint executes bounded setup commands only inside
that image and rejects browser-origin requests. It is not included in product packages
and must never be deployed as a normal server. Existing embedded browser probes run
inside the fixture image; maintained UI verification uses the Playwright entry.

The fixture image exposes the real application on 54318 with its unchanged loopback
host/origin admission. Its test-only UI deployment on 54320 accepts the reserved
`app.redpact.test` origin and forwards same-origin requests to the loopback upstream.
Cross-origin requests remain rejected. Current Playwright setup uses 54320; an older
controller using loopback 54318 can still inspect the same application. This deployment
fixture does not establish production proxy, TLS or external API compatibility.
