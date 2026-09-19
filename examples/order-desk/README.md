# Order Desk

A small shop with checkout, inventory reservations and order history. The HTTP app runs in a managed Compose container. The dependency's `mock` mode injects `PAYMENTS_MODE` into `app`; the application implements that mock. One `.redpact/settings.json` defines the mode. User-owned Vitest fixtures resolve the `app` service from the per-run connection file.

Node 24+, pnpm and Docker with Compose are required. Inventory and orders are in memory for one execution environment. Each new execution starts a fresh temporary environment; state does not persist across runs. This fixture does not cover a real payment gateway or database durability.

## Run through Redpact

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @redpact/server build
node app/server/dist/cli.js serve --project "$PWD/examples/order-desk" --port 4318 --data-dir "$PWD/.redpact-order-desk-runtime"
```

Use the connected agent to follow the [current first-run guide](../../docs/first-run.md): call `configure validate`, then `run_tests` with this example's absolute path, `tests: ["http.test.js"]`, and `selection: { services: ["app"], select: { payments: "mock" } }`. Poll the returned identity with `get_run`. Execution prepares and removes its own temporary environment; recorded sources and results remain.

For the scripted HTTP check against that server:

```sh
REDPACT_URL=http://127.0.0.1:4318 node examples/order-desk/tools/review.mjs http
```

The helper validates configuration, saves the `app` / `payments: mock` selection, submits each scenario and waits for its execution-owned environment to be removed. `all` runs the catalog with a fresh environment for each scenario. It never prepares or reuses the manual Project Container.

## Coverage

| Selection | Observed outcome expected | Purpose |
|---|---|---|
| `http` | `passed` | Checkout over the observed mapped container URL, using the injected payment mode |
| `checkout` | `passed` (7 cases) | Integer totals, invalid quantities, insufficient stock, payment rollback/retry, concurrent checkout, defensive copies, instance isolation |
| `assertion-failed` | `assertion_failed` | A deliberately incorrect total expectation |
| `execution-error` | `execution_error` | An unexpected payment mock exception |
| `collection-error` | `collection_error` | A fixture throws while the test module is collected |
| `skipped` | `unknown` | An unimplemented refund scenario is not a pass |
| `timeout` | `execution_error` | A scenario exceeds its explicit test deadline |
| `cancelled` | `cancelled` | Client cancellation after the runner enters `running`; this does not prove the test body started |

The regular server test suite executes the in-process and diagnostic bundles with the real Vitest adapter. The `http` selection requires the container environment. Intentionally failing files are kept outside the default checkout bundle, not swept into it by a directory glob.

## Extend the project

- Add discounts, multiple products, or refunds to `src/shop.js`; write static cases in `tests/checkout.test.js` first.
- Keep fixtures deterministic. The concurrent checkout test uses a controlled promise rather than timing guesses.
- When introducing a helper, explicitly add its path to the submission bundle in `tools/review.mjs` and the server's example regression tests. External imports are not automatically captured.
- To review a change, submit once, modify the implementation or tests, and submit again. Earlier bundles remain immutable. No code freshness or human approval is inferred.
- Add a diagnostic selection in `scenarios.json` when a different outcome needs its own bundle.


The `steps` sample records three awaited execution boundaries (API request, order response, total validation) with individual verdicts and durations. It submits `tests/steps.ts` with the test. The viewer shows these under observed results after the run finishes; no DB durability or live streaming is implied.
## Dependency settings and Agent workflow

The runnable catalog is [this project's settings](.redpact/settings.json); the
[MCP contract](../../docs/interfaces.md) documents file-based execution. The repository
root's configuration guide describes Redpact itself, not the Order Desk catalog. This project's
`.redpact/settings.json` resolves `compose.yaml` from this directory. It declares five application services and one payment dependency with an implemented
`mock` mode. The four optional app instances are selected through execution roots;
Node runtime defaults live in Compose. The settings regression covers all 16 root
combinations that include `app`. The current first-run guide selects only `app` and payments/mock.
`APP_URL` supports the recorded-step scenario; portable HTTP fixtures use the runtime
connection manifest. No external payment account or credentials are needed.

See [portable Vitest fixtures](../../docs/execution.md) for service-name connections
and user-owned SDK clients.

## Mixed result review

The legacy `mixed-results` bundle contains one successful checkout and one deliberately failed total expectation in the same submission. Both use the in-process shop with mocked payment and record steps.
The second test expects 1250 cents for two 1250-cent items; Vitest records the
actual assertion failure. This is a diagnostic sample, not a passing regression
suite. Its expected outcome is `assertion_failed`; use a current execution path with an explicit complete source bundle to record it.

## MCP execution

The example's `tests.directory` defaults to `tests`. After `configure validate`
with the absolute example path, call `run_tests` with that path, the baseline
service/mode selection, and `tests: ["http.test.js", "steps.test.ts"]`. These tests
use the managed HTTP application and local helpers. Poll `get_run` for results and cleanup state. Do not pass `environmentId` to a new request; every execution owns a fresh temporary environment. Use the viewer to retry failed cleanup.

`checkout.test.js` imports application source outside the isolated test directory;
an explicit HTTP submission must supply that complete bundle. The legacy review script is not compatible with current environment execution. The MCP
file collector does not claim complete external-import tracking.
