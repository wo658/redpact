import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

let directory: string
let app: ReturnType<typeof createApp>
const headers = {
  Host: "localhost",

  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "redpact-configure-"))
  app = createApp({ settings: createSettingsService(directory) } as Services)
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
async function rpc(method: string, params: object = {}) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  expect(response.status).toBe(200)
  return (await response.json()).result
}
const configure = (action: string, extra = {}) =>
  rpc("tools/call", { name: "configure", arguments: { action, ...extra } })

test("a fresh project receives container authoring guidance and validates agent-authored settings", async () => {
  const description = (await configure("describe")).structuredContent
  expect(description.specification.workflow.join(" ")).toContain("Dockerfile")
  const inspection = (await configure("inspect")).structuredContent
  expect(inspection.nextSteps.join(" ")).toContain("Dockerfile")
  expect(await readdir(directory)).toEqual([])

  await mkdir(join(directory, ".redpact"))
  await writeFile(join(directory, "compose.yaml"), "services:\n  app:\n    image: node:24\n")
  await writeFile(
    join(directory, ".redpact/settings.json"),
    JSON.stringify({ composeFiles: ["compose.yaml"], dependencies: {} }),
  )
  const result = (await configure("validate", { selection: { services: ["app"], select: {} } }))
    .structuredContent
  expect(result.validation.valid).toBe(true)
  expect(result.plan).toBeDefined()
  expect(result.environment.readiness).toBe("not_checked")
})

test("one read-only configure tool describes the schema before settings exist", async () => {
  const list = await rpc("tools/list")
  const tool = list.tools.find((tool: { name: string }) => tool.name === "configure")
  expect(tool).toBeDefined()
  expect(tool.description).toContain("describe")
  expect(tool.description).toContain("rulesRoot")
  expect(tool.description).toContain("validate")
  expect(tool.inputSchema.properties.action.description).toContain("inspect")
  expect(tool.inputSchema.properties.path.description).toContain("absolute")
  expect(tool.inputSchema.properties.selection.description).toContain("not saved")
  expect(tool.annotations.readOnlyHint).toBe(true)
  expect(tool.inputSchema.properties.action.enum).toEqual(["describe", "inspect", "validate"])
  const result = await configure("describe")
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toMatchObject({
    projectRoot: directory,
    specification: { path: ".redpact/settings.json", format: "json" },
  })
  expect(result.structuredContent.specification.schema.properties).not.toHaveProperty("version")
  expect(result.structuredContent.specification.schema.additionalProperties).toBe(false)
  expect(JSON.parse(result.structuredContent.specification.example).composeFiles).toEqual([
    "compose.yaml",
  ])
  expect((await configure("describe", { version: 4 })).isError).toBe(true)
  expect(result.structuredContent.specification.workflow.join(" ")).toContain(
    "isolated, shared-local, remote and mock",
  )
  expect(result.structuredContent.nextSteps.length).toBeGreaterThan(0)
  const missing = await configure("validate")
  expect(missing.isError).toBe(true)
  expect(missing.structuredContent.validation.valid).toBe(false)
})

test("configure rereads edits and shares HTTP diagnostics without writing files", async () => {
  await mkdir(join(directory, ".redpact"))
  const file = join(directory, ".redpact/settings.json")
  const invalid = '{\n"composeFiles":["compose.yaml"],\n"tests":{"timeoutMs":"slow"}}'
  await writeFile(file, invalid)
  const result = await configure("validate")
  const http = await app.request("/api/settings", { headers })
  expect(result.isError).toBe(true)
  expect(result.structuredContent.validation).toEqual(await http.json())
  expect(result.structuredContent.validation.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: "tests.timeoutMs", line: 3 })]),
  )
  expect(await readFile(file, "utf8")).toBe(invalid)
  await writeFile(join(directory, "compose.yaml"), "services:\n  app:\n    image: example/app\n")
  await writeFile(
    file,
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: { payments: { modes: { mock: { env: { app: { MODE: "mock" } } } } } },
    }),
  )
  const inspection = await configure("inspect")
  expect(inspection.isError).not.toBe(true)
  expect(inspection.structuredContent.settings.dependencies.payments.modes.mock.env.app.MODE).toBe(
    "mock",
  )
  expect(inspection.structuredContent.environment).toEqual({
    readiness: "not_checked",
    provisioning: "unsupported",
  })
  const valid = await configure("validate")
  expect(valid.structuredContent.validation.valid).toBe(true)
  for (const response of [inspection, valid]) {
    expect(response.structuredContent.dependencies).toEqual({ payments: ["mock"] })
    expect(response._meta.redpact).toMatchObject({
      path: directory,
      valid: true,
      dependencies: { payments: ["mock"] },
      issues: [],
    })
  }
  expect(valid.structuredContent.settings).toBeUndefined()
  expect(valid.structuredContent.validation.source).toBeUndefined()
})

test("configure rejects unavailable actions and cannot select an arbitrary project", async () => {
  expect((await configure("prepare")).isError).toBe(true)
  expect((await configure("describe", { projectRoot: "/another-project" })).isError).toBe(true)
})

test("configure card preserves missing-file diagnostics", async () => {
  const result = await configure("validate")
  expect(result._meta.redpact.valid).toBe(false)
  expect(result._meta.redpact.issues).toEqual(result.structuredContent.validation.issues)
  expect(result._meta.redpact.issues.length).toBeGreaterThan(0)
})

test("unit-only configuration guidance requires its runtime container without integration services", async () => {
  await writeFile(join(directory, "unit.Dockerfile"), "FROM node:24-bookworm-slim\n")
  await mkdir(join(directory, ".redpact"))
  await writeFile(
    join(directory, ".redpact/settings.json"),
    JSON.stringify({
      unitTests: {
        dockerfile: "unit.Dockerfile",
        command: "pnpm test",
        patterns: ["src/**/*.test.ts"],
      },
    }),
  )
  const result = (await configure("validate")).structuredContent
  expect(result.validation.valid).toBe(true)
  expect(result.nextSteps.join(" ")).toContain("Unit Test")
  expect(result.nextSteps.join(" ")).toContain("run_tests is only for managed integration")
  const description = (await configure("describe")).structuredContent
  expect(description.nextSteps.join(" ")).toContain("For managed integration")
  expect(description.specification.workflow.join(" ")).toContain("Preserve existing")
})
