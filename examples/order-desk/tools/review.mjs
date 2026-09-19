import { readFile } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const root = new URL("../", import.meta.url)
const scenarios = JSON.parse(await readFile(new URL("scenarios.json", root), "utf8"))
const selection = process.argv[2] ?? "checkout"
if (selection === "--help") {
  console.log(
    `Usage: node examples/order-desk/tools/review.mjs [all|${Object.keys(scenarios).join("|")}]`,
  )
  console.log("REDPACT_URL defaults to http://127.0.0.1:54318.")
  process.exit(0)
}
if (selection !== "all" && !Object.hasOwn(scenarios, selection)) {
  throw new Error(`Unknown scenario: ${selection}. Use --help to list scenarios.`)
}
const base = new URL(process.env.REDPACT_URL ?? "http://127.0.0.1:54318")
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("Use a loopback HTTP Redpact server")
}

async function request(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(`${path}: ${JSON.stringify(result)}`)
  }
  return result
}

const project = await request("/api/projects", { path: fileURLToPath(root), name: "Order Desk" })
const worktree = await request(`/api/projects/${project.id}/worktrees`, {
  path: fileURLToPath(root),
})
async function configure(action) {
  const result = await request("/mcp", {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "configure", arguments: { action, worktreeId: worktree.id } },
  })
  if (result.error || result.result.isError) {
    throw new Error(JSON.stringify(result))
  }
  return result.result.structuredContent
}
await configure("describe")
await configure("validate")
await request(
  `/api/worktrees/${worktree.id}/selection`,
  {
    services: ["app"],
    select: { payments: "mock" },
  },
  "PUT",
)

async function waitForCleanup(runId) {
  const deadline = Date.now() + 60000
  while (true) {
    const run = await request(`/api/runs/${runId}`)
    if (run.state === "finished") {
      if (!run.environmentId) {
        return
      }
      const environment = await request(`/api/environments/${run.environmentId}`)
      if (environment.state === "stopped") {
        return
      }
      if (environment.state === "stop_failed") {
        throw new Error(JSON.stringify(environment))
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for execution cleanup: ${runId}`)
    }
    await setTimeout(250)
  }
}

for (const [name, scenario] of Object.entries(scenarios)) {
  if (selection !== "all" && name !== selection) {
    continue
  }
  const files = await Promise.all(
    [
      "src/shop.js",
      "tests/payment.js",
      ...(name === "steps" || name === "mixed-results" ? ["tests/steps.ts"] : []),
      "tests/connections.js",
      "tests/fixtures.js",
      scenario.test,
    ].map(async (path) => ({
      path,
      source: await readFile(new URL(path, root), "utf8"),
    })),
  )
  const work = await request("/api/work-items", {
    worktreeId: worktree.id,
    intent: `Order Desk: ${name}; expected Redpact outcome: ${scenario.outcome}. Payment is mocked.`,
  })
  const submission = await request(`/api/work-items/${work.id}/submissions`, { files })
  let run = await request("/api/runs", {
    submissionId: submission.id,
  })
  try {
    console.log(
      JSON.stringify({
        scenario: name,
        worktreeId: worktree.id,
        submissionId: submission.id,
        runId: run.id,
      }),
    )
    const deadline = Date.now() + 180000
    let cancelled = false
    while (run.state !== "finished") {
      if (Date.now() > deadline) {
        await request(`/api/runs/${run.id}/cancel`, {})
        throw new Error(`Timed out waiting for ${run.id}; cancellation requested`)
      }
      if (scenario.cancel && run.state === "running" && !cancelled) {
        await request(`/api/runs/${run.id}/cancel`, {})
        cancelled = true
      }
      await setTimeout(100)
      run = await request(`/api/runs/${run.id}`)
    }
    console.log(
      JSON.stringify({
        scenario: name,
        expected: scenario.outcome,
        observed: run.result.outcome,
        cases: run.result.cases.length,
        runId: run.id,
      }),
    )
    if (run.result.outcome !== scenario.outcome) {
      process.exitCode = 1
    }
  } finally {
    if (run.state !== "finished") {
      await request(`/api/runs/${run.id}/cancel`, {})
    }
    await waitForCleanup(run.id)
  }
}
