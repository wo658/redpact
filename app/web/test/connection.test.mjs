import assert from "node:assert/strict"
import { createServer as createHttpServer } from "node:http"
import { after, test } from "node:test"
import { JSDOM } from "jsdom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const requests = []
const upstream = createHttpServer((req, res) => {
  requests.push({
    url: req.url,
    origin: req.headers.origin,
    authorization: req.headers.authorization,
  })
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify([{ id: "project-one", name: "Actual project" }]))
})
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
const target = `http://127.0.0.1:${upstream.address().port}`
process.env.REDPACT_API_URL = target
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } })
await server.listen()
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
const withSidebar = (element) =>
  createElement(
    TooltipProvider,
    null,
    createElement(SidebarProvider, { defaultOpen: false }, element),
  )
after(async () => {
  await server.close()
  await new Promise((resolve) => upstream.close(resolve))
  delete process.env.REDPACT_API_URL
})

test("entry connects automatically without a token form or demo data", async () => {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  const html = renderToStaticMarkup(createElement(App))
  assert.match(html, /Open an execution from chat/)
  assert.doesNotMatch(html, /type="password"|Server token/)
  assert.doesNotMatch(html, /wt-orders|checkout-api|Preview dataset/)
})

test("same-origin proxy works without credentials and normalizes the upstream origin", async () => {
  const response = await fetch(`${origin}/api/projects`, {
    headers: { Origin: origin },
  })
  assert.match(response.headers.get("content-type"), /application\/json/)
  assert.equal((await response.json())[0].id, "project-one")
  assert.deepEqual(requests.at(-1), {
    url: "/api/projects",
    origin: target,
    authorization: undefined,
  })
})

test("foreign and null origins cannot reach the API through the development proxy", async () => {
  const before = requests.length
  for (const foreign of ["https://foreign.example", "null"]) {
    const response = await fetch(`${origin}/api/projects`, {
      method: "POST",
      headers: { Origin: foreign, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp" }),
    })
    assert.equal(response.status, 403)
  }
  assert.equal(requests.length, before)
})

test("proxy rejects browser fetch metadata from a different site without Origin", async () => {
  const before = requests.length
  for (const site of ["cross-site", "same-site"]) {
    const response = await fetch(`${origin}/api/projects`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": site, "Content-Type": "application/json" },
      body: "{}",
    })
    assert.equal(response.status, 403)
  }
  assert.equal(requests.length, before)
})

test("observed results show actual failures and never promote parsed assertions to passed", async () => {
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const html = renderToStaticMarkup(
    createElement(TestEvidence, {
      submission: {
        id: "s1",
        digest: "abc",
        files: [{ path: "real.test.ts", source: "expect(actual).toBe(2)" }],
        parsed: [
          {
            path: "real.test.ts",
            review: {
              scenarios: [
                {
                  title: "real test",
                  intent: "Check real value",
                  assertions: [{ code: "expect(actual).toBe(2)", observed: "unknown" }],
                },
              ],
              limitations: [],
            },
          },
        ],
      },
      run: {
        state: "finished",
        limitations: ["Scenario-level observation"],
        result: {
          outcome: "assertion_failed",
          cases: [
            {
              name: "real test",
              file: "real.test.ts",
              state: "failed",
              errors: [{ name: "AssertionError", message: "expected 1 to be 2" }],
            },
          ],
          errors: [],
        },
      },
    }),
  )
  assert.match(html, /expected 1 to be 2/)
  assert.match(html, /assertion_failed/)
  assert.match(html, /aria-label="Failed"/)
  assert.doesNotMatch(html, /aria-label="Success"/)
  assert.doesNotMatch(html, /expect\(actual\)/)
})
