import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
const { TestObservation } = await server.ssrLoadModule("/src/components/test-observation.tsx")
const submission = {
  id: "submission-one",
  digest: "digest-one",
  files: [{ path: "checkout.test.ts", source: "expect(await readStock()).toBe(8)" }],
  parsed: [
    {
      path: "checkout.test.ts",
      review: {
        scenarios: [
          {
            title: "Persist order and deduct stock",
            intent: "Verify API and PostgreSQL state",
            assertions: [
              {
                code: "expect(response.status).toBe(201)",
                reason: "Accept the order",
                observed: "unknown",
              },
              {
                code: "expect(await readStock()).toBe(8)",
                reason: "Deduct ordered stock",
                observed: "unknown",
              },
            ],
          },
        ],
        limitations: [],
      },
    },
  ],
}
function render(cases, outcome = "assertion_failed") {
  return renderToStaticMarkup(
    createElement(TestEvidence, {
      submission,
      run: {
        id: "run-one",
        state: "finished",
        createdAt: "2026-09-08T00:00:00Z",
        limitations: [],
        result: { outcome, cases, errors: [] },
      },
    }),
  )
}
test("live results show failures inline and separate them from successful scenarios", () => {
  const html = render([
    {
      name: "Persist order and deduct stock",
      file: "checkout.test.ts",
      state: "failed",
      errors: [
        { name: "AssertionError", message: "expected 10 to be 8", stack: "at checkout.test.ts:24" },
      ],
    },
    { name: "Reject insufficient stock", file: "checkout.test.ts", state: "passed", errors: [] },
  ])
  assert.match(html, /Persist order and deduct stock/)
  assert.match(html, /Reject insufficient stock/)
  assert.ok(html.indexOf('aria-label="Failed"') < html.indexOf('aria-label="Success"'))
  assert.match(html, /expected 10 to be 8/)
  assert.match(html, /aria-label="Success"[\s\S]*?data-slot="badge"[^>]*>1</)
  assert.match(html, /aria-label="Failed"[\s\S]*?data-slot="badge"[^>]*>1</)
})
test("an environment failure without observations never invents scenario results", () => {
  const html = render([], "environment_error")
  assert.match(html, /environment_error/)
  assert.match(html, /Environment failed; no test results were recorded/)
  assert.doesNotMatch(html, /No recorded result/)
  assert.match(html, /No individual test results were recorded/)
  assert.doesNotMatch(html, /data-scenario-result/)
})
test("unrecognized and skipped verdicts remain visible without a passing icon", () => {
  const html = render(
    [
      { name: "Future state", file: "checkout.test.ts", state: "future_status", errors: [] },
      { name: "Optional check", file: "checkout.test.ts", state: "skipped", errors: [] },
    ],
    "passed",
  )
  assert.match(html, /future_status/)
  assert.match(html, /skipped/)
  assert.doesNotMatch(html, /data-verdict="passed"/)
})
test("observed steps show their own verdicts even inside a failed scenario", () => {
  const html = render([
    {
      name: "Checkout",
      file: "checkout.test.ts",
      state: "failed",
      errors: [],
      steps: [
        { id: "api", name: "API accepted", state: "passed", startedAt: 100, durationMs: 12 },
        { id: "db", name: "Saved order", state: "failed", startedAt: 112, durationMs: 5 },
        { id: "stock", name: "Stock check", state: "interrupted", startedAt: 117 },
      ],
    },
  ])
  assert.match(html, /API accepted/)
  assert.doesNotMatch(html, /12 ms/)
  assert.match(html, /data-step-state="passed"/)
  assert.match(html, /data-step-state="failed"/)
  assert.match(html, /data-step-state="interrupted"/)
  assert.doesNotMatch(html, /Step-level evidence has not been recorded/)
})

test("overview groups exact verdicts, puts failures first, and counts duplicate cases", () => {
  const html = renderToStaticMarkup(
    createElement(TestEvidence, {
      submission,
      run: {
        state: "finished",
        result: {
          outcome: "assertion_failed",
          errors: [],
          cases: [
            { name: "Same name", file: "one.test.ts", state: "passed", errors: [] },
            { name: "Failure", file: "one.test.ts", state: "failed", errors: [] },
            { name: "Same name", file: "one.test.ts", state: "passed", errors: [] },
            { name: "Other file", file: "two.test.ts", state: "passed", errors: [] },
            { name: "Optional", file: "one.test.ts", state: "skipped", errors: [] },
            { name: "Future", file: "one.test.ts", state: "future_status", errors: [] },
          ],
        },
      },
    }),
  )
  assert.match(html, /aria-label="Failed"/)
  assert.match(html, /aria-label="Success"/)
  assert.ok(html.indexOf('aria-label="Failed"') < html.indexOf('aria-label="Success"'))
  assert.match(html, /aria-label="Success"[\s\S]*?data-slot="badge"[^>]*>2</)
  assert.match(html, /aria-label="skipped"/)
  assert.match(html, /aria-label="future_status"/)
  assert.equal((html.match(/Same name<\/h3>/g) ?? []).length, 2)
  assert.doesNotMatch(html, /Other file<\/h3>/)
  assert.doesNotMatch(html, /draggable=|aria-roledescription="draggable"/)
})

test("overview leaves unobserved declarations outside success and failure groups", () => {
  const html = renderToStaticMarkup(createElement(TestEvidence, { submission, run: null }))
  assert.match(html, /No recorded result/)
  assert.doesNotMatch(html, /aria-label="Success"|aria-label="Failed"/)
})

test("project integration execution explains its project defaults and exposes their editor", async () => {
  const html = renderToStaticMarkup(
    createElement(TestObservation, {
      api: {},
      projectId: "project",
      worktreeId: "primary",
      scope: "all",
    }),
  )
  assert.match(html, /Integration defaults/)
  assert.match(html, /project integration defaults/)
  assert.doesNotMatch(html, /saved worktree environment choices/)
})

test("each test surface names its own execution path", async () => {
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  const integration = renderToStaticMarkup(
    createElement(TestObservation, {
      api: {},
      projectId: "project",
      worktreeId: "primary",
      scope: "all",
    }),
  )
  const unit = renderToStaticMarkup(createElement(UnitTests, { api: {}, worktreeId: "primary" }))
  assert.match(integration, /Run Integration tests/)
  assert.match(unit, /Run Unit command/)
})
