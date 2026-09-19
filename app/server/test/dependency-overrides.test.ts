import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { createSettingsService, readJsonSettings } from "../src/adapters/settings/json.js"
import { configureSettings } from "../src/workflows/configure.js"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dependency-overrides-"))
  roots.push(root)
  const primary = join(root, "primary"),
    target = join(root, "target"),
    other = join(root, "other")
  for (const path of [primary, target, other]) {
    await mkdir(join(path, ".redpact"), { recursive: true })
    await writeFile(join(path, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
  }
  const source = JSON.stringify({ composeFiles: ["compose.yaml"], tests: { timeoutMs: 1234 } })
  await writeFile(join(primary, ".redpact/settings.json"), source)
  return { primary, target, other, source }
}
const override = {
  dependencies: { llm: { modes: { mock: { env: { app: { LLM_MODE: "mock" } } } } } },
  testEnv: { MODEL: "fixture" },
}
const selection = { services: ["app"], select: { llm: "mock" } }
test("WT 의존성은 해당 실행에만 적용되고 공통 설정과 캡처를 보존한다", async () => {
  const { primary, target, other, source } = await fixture()
  await writeFile(join(target, ".redpact/dependencies.override.json"), JSON.stringify(override))
  const result = await createSettingsService(target, primary).read(selection)
  expect(result.valid, JSON.stringify(result.issues)).toBe(true)
  expect(result.settings?.dependencies.llm.modes.mock.env.app.LLM_MODE).toBe("mock")
  expect(result.settings?.tests).toMatchObject({ timeoutMs: 1234, env: { MODEL: "fixture" } })
  expect((await createSettingsService(other, primary).read()).settings?.dependencies).toEqual({})
  expect(await readFile(join(primary, ".redpact/settings.json"), "utf8")).toBe(source)
  expect((await readJsonSettings(target, selection, result.projectRules)).digest).toBe(
    result.digest,
  )
  await writeFile(join(target, ".redpact/dependencies.override.json"), "{}")
  expect((await readJsonSettings(target, selection, result.projectRules)).digest).toBe(
    result.digest,
  )
  expect((await createSettingsService(target, primary).read()).digest).not.toBe(result.digest)
})
test.each([
  '{"tests":{}}',
  '{"dependencies":{},"dependencies":{}}',
  '{"composeFiles":["../bad"]}',
  '{"dependencies":{"llm":null}}',
])("잘못된 WT override는 공통 설정으로 대체하지 않는다: %s", async (source) => {
  const { primary, target } = await fixture()
  await writeFile(join(target, ".redpact/dependencies.override.json"), source)
  const result = await createSettingsService(target, primary).read()
  expect(result.valid).toBe(false)
  expect(result.issues[0].file).toBe(join(target, ".redpact/dependencies.override.json"))
})
test("inspect는 공통 설정을 보존한 승격 후보를 반환한다", async () => {
  const { primary, target } = await fixture()
  await writeFile(join(target, ".redpact/dependencies.override.json"), JSON.stringify(override))
  const response = await configureSettings(
    createSettingsService(target, primary),
    "inspect",
    false,
    selection,
  )
  expect(response).toHaveProperty("promotion")
})

test("MCP에서 승격 후보를 검토하고 공통 설정에 반영해도 실행 계획은 같다", async () => {
  const { createApp } = await import("../src/app.js")
  const { primary, target, other } = await fixture()
  const overrideFile = join(target, ".redpact/dependencies.override.json")
  await writeFile(overrideFile, JSON.stringify(override))
  const app = createApp({
    settings: createSettingsService(target, primary),
  } as import("../src/workflows/services.js").Services)
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      Host: "localhost",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "configure",
        arguments: { action: "inspect", selection },
      },
    }),
  })
  const { result } = await response.json()
  expect(result.isError).not.toBe(true)
  const inspected = result.structuredContent
  expect(inspected.validation.valid).toBe(true)
  expect(JSON.parse(inspected.promotion.source).tests.timeoutMs).toBe(1234)
  expect(inspected.promotion.baseSha256).toMatch(/^[a-f0-9]{64}$/)
  await writeFile(join(primary, ".redpact/settings.json"), inspected.promotion.source)
  await rm(overrideFile)
  const promoted = await createSettingsService(target, primary).read(selection)
  expect(promoted.plan).toEqual(inspected.plan)
  expect((await createSettingsService(other, primary).read(selection)).plan).toEqual(inspected.plan)
})

test("override 변경은 의존성 전체를 교체하고 다른 의존성을 보존한다", async () => {
  const { primary, target } = await fixture()
  await writeFile(
    join(primary, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: {
        llm: { modes: { remote: { env: { app: { LLM_KEY: { secret: "OLD_KEY" } } } } } },
        cache: { modes: { mock: {} } },
      },
    }),
  )
  await writeFile(join(target, ".redpact/dependencies.override.json"), JSON.stringify(override))
  const result = await createSettingsService(target, primary).read({
    services: ["app"],
    select: { llm: "mock", cache: "mock" },
  })
  expect(result.valid).toBe(true)
  expect(Object.keys(result.settings?.dependencies.llm.modes ?? {})).toEqual(["mock"])
  expect(result.settings?.dependencies.cache.modes).toHaveProperty("mock")
})

test("검토 후 공통 설정이 바뀌면 기존 승격 후보 저장을 거부한다", async () => {
  const { createSettingsEditor } = await import("../src/workflows/settings-editor.js")
  const { createSettingsFiles } = await import("../src/adapters/settings/editor-files.js")
  const { primary, target } = await fixture()
  await writeFile(join(target, ".redpact/dependencies.override.json"), JSON.stringify(override))
  const inspected = await createSettingsService(target, primary).read(selection)
  const promotion = inspected.promotion
  expect(promotion).toBeDefined()
  if (!promotion) {
    throw new Error("Missing promotion")
  }
  const editor = createSettingsEditor({
    projects: { root: async () => primary },
    directory: primary,
    files: createSettingsFiles(),
    validateProject: (root, source) =>
      readJsonSettings(root, undefined, { file: join(root, ".redpact/settings.json"), source }),
  })
  const changed = JSON.stringify({ composeFiles: ["compose.yaml"], tests: { timeoutMs: 4321 } })
  await writeFile(join(primary, ".redpact/settings.json"), changed)
  await expect(
    editor.saveProject("project", { source: promotion.source, revision: promotion.baseSha256 }),
  ).rejects.toMatchObject({ code: "environment_conflict" })
  expect(await readFile(join(primary, ".redpact/settings.json"), "utf8")).toBe(changed)
  const fresh = await createSettingsService(target, primary).read(selection)
  expect(JSON.parse(fresh.promotion?.source ?? "{}").tests.timeoutMs).toBe(4321)
  expect(fresh.promotion?.baseSha256).not.toBe(promotion.baseSha256)
})

test("WT Compose 추가와 선택 충돌 검증이 동일한 설정 경로를 사용한다", async () => {
  const { primary, target } = await fixture()
  await writeFile(join(target, "mock.yaml"), "services:\n  llm-mock:\n    image: alpine:3.21\n")
  await writeFile(
    join(target, ".redpact/dependencies.override.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml", "mock.yaml"],
      dependencies: { llm: { modes: { mock: { services: ["llm-mock"] } } } },
    }),
  )
  const result = await createSettingsService(target, primary).read(selection)
  expect(result.valid).toBe(true)
  expect(result.containers).toEqual(["app", "llm-mock"])
  await writeFile(
    join(target, ".redpact/dependencies.override.json"),
    JSON.stringify({
      ...override,
      dependencies: {
        ...override.dependencies,
        cache: { modes: { mock: { env: { app: { LLM_MODE: "other" } } } } },
      },
    }),
  )
  const invalid = await createSettingsService(target, primary).read({
    services: ["app"],
    select: { llm: "mock", cache: "mock" },
  })
  expect(invalid.valid).toBe(false)
  expect(invalid.issues.some((issue) => issue.message.includes("LLM_MODE"))).toBe(true)
})
