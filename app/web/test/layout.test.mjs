import assert from "node:assert/strict"
import { after, test } from "node:test"
import { JSDOM } from "jsdom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
test("loading feedback uses the shared registry composition", async () => {
  const { Loading } = await server.ssrLoadModule("/src/components/feedback.tsx")
  const loading = new JSDOM(renderToStaticMarkup(createElement(Loading, null, "Loading tests…")))
    .window.document
  const status = loading.querySelector('[role="status"][data-slot="item"]')
  assert.ok(status)
  assert.equal(status.querySelector('[data-slot="item-title"]').textContent, "Loading tests…")
  assert.ok(status.querySelector('[data-slot="spinner"][aria-hidden="true"]'))
})

test("sidebar separator reserves its horizontal margins instead of overflowing the sidebar", async () => {
  const { SidebarSeparator } = await server.ssrLoadModule("/src/components/ui/sidebar.tsx")
  const doc = new JSDOM(renderToStaticMarkup(createElement(SidebarSeparator))).window.document
  const separator = doc.querySelector('[data-slot="sidebar-separator"]')
  assert.ok(separator)
  assert.ok(separator.classList.contains("mx-2"))
  assert.ok(separator.classList.contains("data-horizontal:w-auto"))
  assert.equal(separator.classList.contains("data-horizontal:w-full"), false)
})

test("live Vitest overview keeps source paths and declaration metadata in Detail", async () => {
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const doc = new JSDOM(
    renderToStaticMarkup(
      createElement(TestEvidence, {
        submission: { id: "private-id", digest: "private-digest", files: [], parsed: [] },
        run: {
          state: "finished",
          limitations: [],
          result: {
            outcome: "assertion_failed",
            errors: [],
            cases: [
              { name: "suite > accepts order", file: "order.test.ts", state: "passed", errors: [] },
              {
                name: "suite > rejects order",
                file: "order.test.ts",
                state: "failed",
                errors: [{ name: "AssertionError", message: "expected 422, received 201" }],
              },
              { name: "later", file: "next.test.ts", state: "pending", errors: [] },
            ],
          },
        },
      }),
    ),
  ).window.document
  const results = doc.querySelector('[aria-label="Observed test results"]')
  assert.equal(results.textContent.includes("order.test.ts"), false)
  assert.match(results.textContent, /suite > accepts order/)
  assert.match(results.textContent, /expected 422, received 201/)
  assert.doesNotMatch(results.textContent, /later/)
  assert.ok(doc.querySelector('[role="tree"]'))
  assert.equal(doc.body.textContent.includes("private-digest"), false)
  assert.ok(
    Array.from(doc.querySelectorAll("button")).some(
      (button) => button.textContent === "Executed source",
    ),
  )
})

test("scenario overview keeps recorded steps visible without inventing results for declarations", async () => {
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const submission = {
    id: "s1",
    digest: "digest",
    files: [],
    parsed: [
      {
        path: "checkout.test.ts",
        review: {
          scenarios: [{ title: "Cancel an unpaid order", intent: null, assertions: [] }],
          limitations: [],
        },
      },
    ],
  }
  const render = (run) =>
    new JSDOM(renderToStaticMarkup(createElement(TestEvidence, { submission, run }))).window
      .document
  const unrun = render(null)
  assert.match(unrun.body.textContent, /Cancel an unpaid order/)
  assert.match(unrun.body.textContent, /No recorded result/)
  assert.equal(unrun.querySelector('[data-step-state="passed"]'), null)
  const observed = render({
    state: "finished",
    limitations: [],
    result: {
      outcome: "assertion_failed",
      errors: [],
      cases: [
        {
          name: "Cancel an unpaid order",
          file: "checkout.test.ts",
          state: "failed",
          errors: [{ name: "AssertionError", message: "Stock was not restored" }],
          steps: [
            { id: "cancel", name: "Cancel order", state: "passed", durationMs: 17 },
            { id: "stock", name: "Restore stock", state: "failed" },
          ],
        },
      ],
    },
  })
  assert.equal(observed.querySelectorAll('[data-slot="timeline-item"]').length, 2)
  for (const item of observed.querySelectorAll('[data-slot="timeline-item"]')) {
    const indicator = item.querySelector('[data-slot="timeline-indicator"]')
    const content = item.querySelector('[data-slot="timeline-content"]')
    assert.ok(content.classList.contains("leading-5"))
    assert.ok(indicator.classList.contains("group-data-[orientation=vertical]/timeline:top-0.5"))
    assert.ok(indicator.classList.contains("items-center"))
    assert.ok(indicator.classList.contains("justify-center"))
  }

  assert.match(observed.body.textContent, /Stock was not restored/)
  assert.match(observed.body.textContent, /Cancel order/)
  assert.match(observed.body.textContent, /Restore stock/)
  assert.doesNotMatch(observed.body.textContent, /17 ms/)
  assert.equal(observed.querySelector("table"), null)
  assert.equal(observed.querySelector('[aria-label="Observed test results"] [aria-expanded]'), null)
})
