---
title: Run your first managed test
description: Execute the included HTTP scenario, inspect its recorded result, and apply the workflow to your project.
---

# Run your first managed test

This walkthrough uses the included Order Desk application. It runs an HTTP application in Docker with an implemented payment mock, without calling a real gateway. You need a [running server and connected agent](installation.md), plus Docker with Compose.

For your application, complete [project setup](first-project.md), then replace the sample path and test file with your authored values.

The example also provides `tools/review.mjs` for a scripted HTTP check against your
running server. From the repository root, run
`REDPACT_URL=http://127.0.0.1:54318 node examples/order-desk/tools/review.mjs http`.
It uses the example's fixed `app` / `payments: mock` configuration, submits the
scenario and waits for execution cleanup. Use `all` for the fixture catalog; each
scenario receives a fresh environment, never the manual Project Container.

## Inspect the sample

The sample lives at `examples/order-desk` inside the Redpact checkout. Use its absolute path in tool calls, for example `/absolute/path/to/redpact/examples/order-desk`.

Its settings reference `compose.yaml`, define `payments` with a fixed `mock` dependency, and provide service connections to tests. `tests/http.test.js` verifies that checkout returns HTTP 200 with `quantity: 1` and `totalCents: 250`. Local fixtures resolve the managed service address; no allocated host port needs to be guessed.

Call `configure` with `action: "describe"` and the sample path, then validate:

```json
{
  "action": "validate",
  "path": "/absolute/path/to/redpact/examples/order-desk"
}
```

The supplied file already contains sample settings; do not replace it with a generic template.

## Start the scenario

Call the MCP `run_tests` tool:

```json
{
  "path": "/absolute/path/to/redpact/examples/order-desk",
  "tests": ["http.test.js"]
}
```

The test path is relative to the configured integration-test directory, which defaults to `integration`; this example configures it as `tests`. Selecting this scenario avoids unrelated sample tests that require a different explicit source bundle.

Redpact captures the request and returns an identity. If the returned state is `awaiting_approval`, that identity represents a pending review: execution has not started. Follow the controls available in your connected client, or consult [troubleshooting](troubleshooting.md) if the client cannot present them. Repeated polling does not approve the request.

Redpact snapshots integration test sources when accepting the request, before any approval wait. Once admitted for execution, it prepares the selected environment using those captured tests. Editing test files during review does not update that submission; submit a new request to include edits. A queued state can include preparation; receiving an ID is not a passing result. Repeating `run_tests` creates another request. Use `get_run` to follow the accepted request.

## Read the result

Call `get_run` with the returned ID:

```json
{
  "id": "RETURNED_RUN_ID"
}
```

Continue until execution reaches a terminal state. Inspect the scenario result, diagnostics, and environment cleanup status. The expected sample outcome is a passing checkout scenario; these instructions are not evidence that it passed on your computer.

If startup fails, diagnose the environment before changing assertions. An assertion failure, module collection error, and Docker startup problem mean different things. See [troubleshooting](troubleshooting.md).

## Find the same execution in the viewer

Select the Order Desk project and the checkout used in the request. Inspect Integration results and Log, comparing the recorded submission/run identity with the tool response. Missing records often indicate a different server instance or checkout.

Open recorded source to see what was submitted. Later working-file edits do not update that snapshot. A pass describes the scenario that ran; it does not verify untested behavior or cover later edits. See [reading results](results.md).

## Understand the sample assertion

The sample imports `test` and `expect` from a local fixture. That fixture exposes an API client for the prepared application. The core check is:

```js
const response = await api.checkout()
expect(response.status).toBe(200)
expect(await response.json()).toMatchObject({ quantity: 1, totalCents: 250 })
```

The status assertion checks that the request succeeded. The body assertion checks the expected quantity and total while allowing other response fields. Read the fixture and application together before adapting the request; the example's API client is application code, not a built-in Redpact API.

This scenario verifies one checkout response with the selected mock. It does not establish real payment-provider compatibility, persistence after a restart, or browser behavior. Add a scenario at the relevant boundary when you need those claims.

## Make the first result useful for review

After the request finishes, collect these details from the actual record:

| Detail | Why it matters |
|---|---|
| Returned execution identity | Lets the viewer and agent refer to the same attempt |
| Absolute checkout path | Confirms the intended application sources were selected |
| Submitted test and case | Shows what was checked |
| Configured services and dependency kinds | Explains whether a real dependency or substitute was involved |
| Case outcome and first relevant error | Separates an assertion result from preparation failure |
| Cleanup status | Shows whether temporary resources were removed |

A useful report might say that the recorded checkout case passed with `payments: mock`, and name the actual run ID. Fill these details from the returned evidence; do not copy an example outcome as if it were observed.

## Retry after a change

If the first attempt fails, keep its ID and fix the reported cause. A missing helper needs a source-bundle correction; a failed image build needs an application build correction; an unexpected response needs investigation of the assertion and behavior.

Submit a new request after fixing the relevant inputs. Use `get_run` only to read an existing request: it does not rerun tests or pick up edits. Compare the new recorded source and outcome with the original failure. The new execution prepares an environment from the current application and settings inputs.

## Environment lifetime

Each run prepares a temporary environment and removes its resources after execution. Recorded sources, results, and logs remain. Cleanup status is separate from the test verdict: a passing test can still require attention if resource removal fails.

Every test execution gets its own environment; standalone test-environment preparation and reuse are unavailable. For manual inspection, Project Container explicitly starts a separate environment that cannot supply test runs. Independently managed services use shared-local or remote kinds. Users cancel runs or retry cleanup through web controls; MCP does not expose separate lifecycle tools.

## Move to your application

Ask the agent to write one meaningful integration scenario for an observable application behavior using actual service connections and assertions. Keep required helpers within the collected bundle; arbitrary imports outside it are not automatically captured. Run against the actual checkout intended for review and retain the returned identity.

Continue with [test types and authoring](tests.md) for unit commands, Vitest integration tests, and Playwright functional tests or captures.
