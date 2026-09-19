import { expect, test } from "vitest"
import { parseSettings } from "../src/adapters/settings/json.js"
import { describeSettings } from "../src/core/settings.js"

test.each([
  "version: 1",
  '{"composeFiles":["compose.yaml"],}',
  '{"composeFiles":[],"composeFiles":[]}',
  '{"composeFiles":["../escape.yaml"]}',
  '{"composeFiles":["compose.yaml"],"version":4}',
  '{"composeFiles":["compose.yaml"],"imports":[]}',
  '{"composeFiles":["compose.yaml"],"tests":{"timeoutMs":"100"}}',
])("rejects invalid or retired configuration %s", (source) => {
  expect(parseSettings(source, "settings.json").valid).toBe(false)
})
test("the MCP example is valid strict JSON and describes one schema", () => {
  const spec = describeSettings()
  expect(JSON.stringify(spec)).not.toMatch(/cancel_run|stop_environment/)
  expect(parseSettings(spec.example, spec.path).valid).toBe(true)
  expect(spec.schema.properties).not.toHaveProperty("version")
  expect(spec.schema.properties).not.toHaveProperty("imports")
})

test("fixed modes allow remote APIs and container-backed mock implementations", () => {
  const result = parseSettings(
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: {
        payments: {
          modes: {
            remote: { env: { app: { PAYMENTS_MODE: "sandbox" } } },
            mock: { services: ["payments-stub"] },
          },
        },
      },
    }),
    "settings.json",
  )
  expect(result.valid).toBe(true)
})

test("captured project rules validate against target Compose even without a local settings file", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { createSettingsService, readJsonSettings } = await import(
    "../src/adapters/settings/json.js"
  )
  const root = await mkdtemp(join(tmpdir(), "shared-rules-"))
  try {
    const primary = join(root, "primary")
    const target = join(root, "target")
    const stage = join(root, "stage")
    await mkdir(join(primary, ".redpact"), { recursive: true })
    await mkdir(target)
    await mkdir(stage)
    const source = JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: { payment: { modes: { mock: { env: { app: { PAYMENT: "mock" } } } } } },
    })
    await writeFile(join(primary, ".redpact/settings.json"), source)
    for (const path of [target, stage]) {
      await writeFile(join(path, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
    }
    const selection = { services: ["app"], select: { payment: "mock" } }
    const accepted = await createSettingsService(target, primary).read(selection)
    expect(accepted.valid).toBe(true)
    expect(accepted.projectRules?.source).toBe(source)
    await writeFile(
      join(primary, ".redpact/settings.json"),
      source.replace('"mock"}', '"changed"}'),
    )
    const captured = await readJsonSettings(stage, selection, accepted.projectRules)
    expect(captured.valid).toBe(true)
    expect(captured.digest).toBe(accepted.digest)
    expect(captured.plan).toEqual(accepted.plan)
    expect((await createSettingsService(target, primary).read(selection)).digest).not.toBe(
      accepted.digest,
    )
    await writeFile(
      join(stage, "compose.yaml"),
      "services:\n  different:\n    image: alpine:3.21\n",
    )
    expect((await readJsonSettings(stage, selection, accepted.projectRules)).valid).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("empty settings normalize to an unconfigured project", () => {
  const result = parseSettings("{}", "settings.json")
  expect(result.valid).toBe(true)
  expect(result.settings).toEqual({
    composeFiles: [],
    dependencies: {},
    tests: { directory: "integration", timeoutMs: 10000, env: {} },
  })
})
