import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createSettingsFiles } from "../src/adapters/settings/editor-files.js"
import { createApp } from "../src/app.js"
import { instanceSettingsSchema } from "../src/core/instance-schema.js"
import { createSettingsEditor } from "../src/workflows/settings-editor.js"

test("설정 조회는 기본값과 외부 수정 진단을 반환하고 파일을 작성하지 않는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-settings-read-"))
  try {
    await mkdir(join(root, ".redpact"))
    const file = join(root, ".redpact/settings.json")
    const settings = createSettingsEditor({
      projects: { root: async () => root },
      directory: root,
      files: createSettingsFiles(),
    })
    expect((await settings.project("project")).source).toBeNull()
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" })
    await writeFile(file, "{}")
    expect((await settings.project("project")).value?.tests).toEqual({
      directory: "integration",
      timeoutMs: 10000,
      env: {},
    })
    expect(await readFile(file, "utf8")).toBe("{}")
    await writeFile(file, "invalid authored content")
    expect((await settings.project("project")).issues).not.toEqual([])
    expect(await readFile(file, "utf8")).toBe("invalid authored content")
    await writeFile(join(root, "settings.json"), '{"approval":"ask"}')
    const app = createApp({ settingsEditor: settings } as never)
    expect((await app.request("/api/projects/project/configuration")).status).toBe(200)
    expect((await (await app.request("/api/instance/settings")).json()).value.approval).toBe("ask")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("instance settings omit logging and reject log-level configuration", () => {
  expect(instanceSettingsSchema.parse({})).toEqual({ server: { port: 54318 } })
  expect(instanceSettingsSchema.safeParse({ logging: { level: "info" } }).success).toBe(false)
})

test("instance resource limits accept bounded user values and reject disabled protection", () => {
  expect(
    instanceSettingsSchema.safeParse({
      testResources: { memoryMiB: 2048, timeoutSeconds: 600 },
    }).success,
  ).toBe(true)
  for (const testResources of [
    { memoryMiB: 0 },
    { memoryMiB: 63 },
    { memoryMiB: 1.5 },
    { timeoutSeconds: 0 },
    { timeoutSeconds: 86401 },
    { unknown: 1 },
  ]) {
    expect(instanceSettingsSchema.safeParse({ testResources }).success).toBe(false)
  }
})

test("instance settings bound managed environment concurrency", () => {
  expect(instanceSettingsSchema.safeParse({ environmentConcurrency: 1 }).success).toBe(true)
  expect(instanceSettingsSchema.safeParse({ environmentConcurrency: 4 }).success).toBe(true)
  expect(instanceSettingsSchema.safeParse({ environmentConcurrency: 0 }).success).toBe(false)
  expect(instanceSettingsSchema.safeParse({ environmentConcurrency: 5 }).success).toBe(false)
  expect(instanceSettingsSchema.safeParse({ environmentConcurrency: 2.5 }).success).toBe(false)
})
