import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import { instanceSettingsSchema } from "../src/core/instance-schema.js"

test("authored settings have independent read/write routes with source revisions", async () => {
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source: "{}",
    revision: "abc",
    issues: [],
  }
  const project = vi.fn(async () => snapshot)
  const saveProject = vi.fn(async () => snapshot)
  const instance = vi.fn(async () => snapshot)
  const app = createApp({ settingsEditor: { project, saveProject, instance } } as never)
  expect((await app.request("/api/projects/p/configuration")).status).toBe(200)
  const response = await app.request("/api/projects/p/configuration", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "{}", revision: "abc" }),
  })
  expect(response.status).toBe(200)
  expect(saveProject).toHaveBeenCalledWith("p", { source: "{}", revision: "abc" })
  expect((await app.request("/api/instance/settings")).status).toBe(200)
})

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSettingsFiles } from "../src/adapters/settings/editor-files.js"
import { readJsonSettings } from "../src/adapters/settings/json.js"
import { createSettingsEditor } from "../src/workflows/settings-editor.js"

test("editor preserves omitted defaults, rejects invalid Compose and detects agent edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-editor-"))
  try {
    await mkdir(join(root, ".redpact"))
    const file = join(root, ".redpact/settings.json")
    const source = '{"composeFiles":["compose.yaml"]}'
    await writeFile(file, source)
    await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    image: example/app\n")
    const editor = createSettingsEditor({
      projects: { root: async () => root },
      directory: root,
      files: createSettingsFiles(),
      validateProject: (path, text) => readJsonSettings(path, undefined, { file, source: text }),
    })
    const initial = await editor.project("project")
    expect(initial.value?.tests).toEqual({ directory: "integration", timeoutMs: 10000, env: {} })
    expect(await readFile(file, "utf8")).toBe(source)
    await expect(
      editor.saveProject("project", {
        source: '{"composeFiles":["missing.yaml"]}',
        revision: initial.revision,
      }),
    ).rejects.toMatchObject({ code: "settings_invalid" })
    expect(await readFile(file, "utf8")).toBe(source)
    const edited = '{"composeFiles":["compose.yaml"],"tests":{"timeoutMs":20000}}'
    const saved = await editor.saveProject("project", {
      source: edited,
      revision: initial.revision,
    })
    expect(saved.source).toBe(edited)
    expect(JSON.parse(await readFile(file, "utf8")).tests).toEqual({ timeoutMs: 20000 })
    await writeFile(file, source)
    await expect(
      editor.saveProject("project", { source: edited, revision: saved.revision }),
    ).rejects.toMatchObject({ code: "environment_conflict" })
    expect(await readFile(file, "utf8")).toBe(source)
    await writeFile(join(root, "settings.json"), '{"approval":"ask"}')
    const instance = await editor.instance()
    await expect(
      editor.saveInstance({ source: '{"server":{"port":70000}}', revision: instance.revision }),
    ).rejects.toMatchObject({ code: "invalid_input" })
    await editor.saveInstance({
      source: '{"approval":"ask","server":{"port":54320}}',
      revision: instance.revision,
    })
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toEqual({
      approval: "ask",
      server: { port: 54320 },
    })
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
