# Order Desk

A small HTTP shop with checkout, inventory reservations and order history. Its fixed
[settings](.redpact/settings.json) run `app` and enable an implemented payment mock.
Application topology metadata does not activate the other declared services. Orders
and inventory are in memory for one execution; this fixture does not verify a real
payment gateway or persistence across runs.

Follow the maintained [review walkthrough](../../docs/review-workflow.md#try-the-included-scenario)
with this directory's absolute path. Use `redpact tests run --kind integration`
with `--test http.test.js`; services and dependency kinds come from shared settings.
Read the returned identity with `redpact runs show --kind integration --id ID` and
open its exact review with `redpact open --kind integration --id ID`.
Each execution prepares and removes its own temporary environment.

`scenarios.json` lists diagnostic bundles including intentional assertion, collection,
execution, timeout and cancellation outcomes. Those are not a passing regression suite.
`checkout.test.js` imports application code outside the isolated test directory, so it
needs an explicit complete source bundle; the HTTP scenario uses captured local helpers.
See [test authoring](../../docs/tests.md) and [portable fixtures](../../docs/execution.md#portable-fixtures).
