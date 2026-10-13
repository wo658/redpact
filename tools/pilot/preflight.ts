import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const requiredTools = [
  "configure",
  "run_tests",
  "get_run",
  "run_playwright",
  "get_execution",
  "get_review_context",
  "get_workspace_status",
]
const requiredPaths = [
  "/api/workspace-status",
  "/api/review-context",
  "/api/worktrees/{id}/playwright/run",
]

export function assessCapabilities(tools: string[], paths: string[]) {
  const missing = [
    ...requiredTools.filter((name) => !tools.includes(name)).map((name) => `MCP ${name}`),
    ...requiredPaths.filter((path) => !paths.includes(path)).map((path) => `HTTP ${path}`),
  ]
  return { ready: missing.length === 0, missing }
}

export async function probe(base: string) {
  const url = new URL(base)
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Use the connected loopback HTTP runtime")
  }
  const [mcp, api] = await Promise.all([
    fetch(new URL("/mcp", url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(10000),
    }),
    fetch(new URL("/openapi.json", url), { signal: AbortSignal.timeout(10000) }),
  ])
  if (!mcp.ok || !api.ok) {
    throw new Error(`Discovery failed: MCP ${mcp.status}, OpenAPI ${api.status}`)
  }
  const discovery = await mcp.json()
  const specification = await api.json()
  if (!Array.isArray(discovery.result?.tools) || !specification.paths) {
    throw new Error("Discovery did not return tools and paths")
  }
  const tools = discovery.result.tools
    .filter(
      (tool: { _meta?: { ui?: { visibility?: string[] } } }) =>
        !tool._meta?.ui?.visibility?.includes("app"),
    )
    .map((tool: { name: string }) => tool.name)
  const paths = Object.keys(specification.paths)
  return {
    checkedAt: new Date().toISOString(),
    origin: url.origin,
    tools,
    ...assessCapabilities(tools, paths),
    limitation:
      "Capability discovery only; no execution, approval, freshness or Docker readiness established.",
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await probe(process.env.REDPACT_URL ?? "http://127.0.0.1:54322")
    const output = `${JSON.stringify(report, null, 2)}\n`
    if (process.argv[2]) {
      await writeFile(process.argv[2], output, { flag: "wx" })
    }
    console.log(output)
    if (!report.ready) {
      process.exitCode = 2
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
