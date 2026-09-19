import assert from "node:assert/strict"
import { after, test } from "node:test"
import { App } from "@modelcontextprotocol/ext-apps"
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
const { EnvironmentCard, TestCard } = await server.ssrLoadModule("/src/components/mcp/cards.tsx")
const { snapshotSchema } = await server.ssrLoadModule("/src/components/mcp/model.ts")
const actions = { busy: false, approve() {}, changePolicy() {} }
const snapshot = {
  kind: "review",
  policy: "ask",
  nextPolicy: "auto",
  token: "private-ui-capability",
  review: {
    id: "r1",
    revision: 0,
    path: "/actual/project",
    policy: "ask",
    state: "pending",
    environmentApproved: false,
    testsApproved: false,
    selection: { services: ["api"], select: { database: "isolated" } },
    dependencies: { database: ["isolated"] },
  },
  submission: {
    digest: "exact-source",
    files: [{ path: "checkout.test.ts", source: '<script>alert("escaped")</script>' }],
    parsed: [
      {
        path: "checkout.test.ts",
        review: {
          scenarios: [{ title: "Actual checkout scenario", intent: null, assertions: [] }],
        },
      },
    ],
  },
}
test("MCP cards render supplied evidence and gate test approval behind environment approval", () => {
  const data = snapshotSchema.parse(snapshot)
  const environment = renderToStaticMarkup(createElement(EnvironmentCard, { data, actions }))
  const tests = renderToStaticMarkup(createElement(TestCard, { data, actions }))
  assert.match(environment, /\/actual\/project/)
  assert.match(environment, /Approve environment/)
  assert.match(environment, /Ask first/)
  assert.match(tests, /Actual checkout scenario/)
  assert.match(tests, /No recorded result/)
  assert.match(tests, /disabled=""[^>]*>Approve tests/)
  assert.doesNotMatch(tests, /Order Desk|AssertionError|RED observed/)
})

test("Auto snapshots omit selectors and action buttons", () => {
  const data = snapshotSchema.parse({
    ...snapshot,
    policy: "auto",
    review: { ...snapshot.review, policy: "auto", state: "started" },
  })
  const html = renderToStaticMarkup(createElement(EnvironmentCard, { data, actions }))
  assert.doesNotMatch(html, /role="combobox"|Approve environment|Stop environment/)
})

test("official App and AppBridge negotiate and carry UI-only metadata and server tool calls", async () => {
  const [appTransport, hostTransport] = InMemoryTransport.createLinkedPair()
  const client = new App({ name: "Redpact test", version: "1" }, {}, { autoResize: false })
  const host = new AppBridge(
    null,
    { name: "Protocol test host", version: "1" },
    { serverTools: {} },
  )
  let received
  client.ontoolresult = (result) => {
    received = result._meta.redpact
  }
  host.oncalltool = async (params) => {
    assert.equal(params.name, "set_approval_policy")
    assert.deepEqual(params.arguments, { token: "private-ui-capability", policy: "auto" })
    return {
      content: [{ type: "text", text: "Next request only" }],
      structuredContent: { policy: "auto" },
    }
  }
  try {
    await host.connect(hostTransport)
    await client.connect(appTransport)
    await host.sendToolInput({ arguments: { path: "/actual/project" } })
    await host.sendToolResult({ content: [], _meta: { redpact: snapshot } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(received, snapshot)
    const result = await client.callServerTool({
      name: "set_approval_policy",
      arguments: { token: "private-ui-capability", policy: "auto" },
    })
    assert.equal(result.structuredContent.policy, "auto")
  } finally {
    await client.close()
    await host.close()
  }
})

test("configuration cards list every declared dependency and mode without an execution selection", () => {
  const data = snapshotSchema.parse({
    kind: "environment",
    path: "/actual/project",
    valid: true,
    dependencies: { database: ["isolated", "remote"], payments: ["mock", "remote"] },
  })
  const html = renderToStaticMarkup(createElement(EnvironmentCard, { data, actions }))
  for (const text of [
    "Valid configuration",
    "Dependencies",
    "database",
    "Per-environment",
    "Remote connection",
    "payments",
    "Mock",
    "Remote connection",
  ]) {
    assert.ok(html.includes(text), `Missing ${text}`)
  }
  assert.doesNotMatch(html, />Selection<|Not selected|No selection supplied|role="combobox"/)
  assert.match(html, /Readiness has not been checked/)
})

test("configuration cards distinguish an empty catalog from invalid settings", () => {
  for (const valid of [true, false]) {
    const data = snapshotSchema.parse({ kind: "environment", valid, dependencies: {} })
    const html = renderToStaticMarkup(createElement(EnvironmentCard, { data, actions }))
    assert.ok(html.includes(valid ? "No dependencies declared." : "Invalid configuration"))
    if (!valid) {
      assert.doesNotMatch(html, /No dependencies declared/)
    }
  }
})

test("execution snapshots keep unselected modes visible beside the selected mode", () => {
  const data = snapshotSchema.parse({
    ...snapshot,
    review: {
      ...snapshot.review,
      policy: "auto",
      state: "started",
      dependencies: { database: ["isolated", "remote"] },
    },
  })
  const html = renderToStaticMarkup(createElement(EnvironmentCard, { data, actions }))
  assert.match(html, /Remote connection/)
  assert.match(html, /Selected: Per-environment/)
})
