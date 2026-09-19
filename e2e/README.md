# Redpact self-E2E

These acceptance tests exercise the built Redpact application through real HTTP,
MCP, Git worktrees, filesystem events, and persisted submissions. They do not import
server Core or rerun the unit-test suite. Browser rendering and nested Docker
provisioning inside the target application are outside this suite's coverage.

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
5. Call `configure validate` with the checkout path and
   `selection: { services: ["app"], select: {} }`. The discovered bundle must include
   `target.ts` and `worktree-evidence.test.ts`.
6. Call `run_tests` with that same path, the selection above, and
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

Redpact supplies `REDPACT_CONNECTIONS_FILE`. The small `tests/target.ts` helper uses
the observed app port to identify exactly one managed container, then issues HTTP
and MCP requests from inside it using `docker exec`. The helper continues to use that transport for existing acceptance tests. The image
now starts Redpact with `--host 0.0.0.0`; host-loopback published ports also provide
browser access without a proxy or disabled request admission.

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

`dependency-topology.test.ts` verifies fixed dependency modes, application-service
relationships, assessment-only mode rejection, explicit execution selection and
revision-preserving rejection of unsupported modes through HTTP and MCP.

`capture-viewport.test.ts` seeds isolated capture records, verifies their public API
readback, and runs Playwright functional assertions against that same application
container's real Mobile toggle. It uses the existing `redpact-playwright:1.63.0-v1`
runner image and reports browser assertions inside the managed Integration result.
It does not claim those seeded PNGs were application captures. Actual automatic
collection, delayed/path attachments, crops and high-DPI pages are independently
verified by `REDPACT_DOCKER_TESTS=1` and `test/playwright-docker.test.ts`.

`dependency-mode-names.test.ts` checks all four mode plans, rejection of service
provisioning by connection modes and retired identifiers, and Korean labels plus
mode switching and persisted editing in actual Chromium at desktop/mobile widths.
The browser assertions run inside its managed Integration result. Fixture dependency
services are declarations, not a claim that PostgreSQL or remote endpoints were run.
