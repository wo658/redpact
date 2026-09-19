import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createProjectSecretStore } from "../src/adapters/storage/project-secrets.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { Environment } from "../src/core/types/environment.js"
import { createProjectSecrets } from "../src/workflows/project-secrets.js"

test("declared blanks, user edits, isolation and pinned execution secrets survive restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-secret-test-"))
  try {
    const settings = settingsSchema.parse({
      dependencies: {
        payment: {
          modes: { remote: { env: { app: { API_KEY: { secret: "CLOUD_KEY" } } } }, mock: {} },
        },
      },
      tests: { env: { TEST_TOKEN: { secret: "TEST_KEY" } } },
    })
    const worktrees = {
      projectSettings: async () => ({
        projectRoot: root,
        read: async () => ({ valid: true, file: "settings.json", issues: [], settings }),
      }),
    }
    const store = createProjectSecretStore(root)
    const service = createProjectSecrets({ store, worktrees, fallback: {} })
    expect(await service.list("project")).toEqual([
      { name: "CLOUD_KEY", configured: false },
      { name: "TEST_KEY", configured: false },
    ])
    const record = {
      id: "execution",
      target: { projectId: "project" },
      plan: { requiredSecrets: ["CLOUD_KEY"] },
    } as Environment
    expect(() => service.resolve(record)).toThrow("Enter required secret CLOUD_KEY")
    expect(await service.set("project", "CLOUD_KEY", "first-private-value")).toEqual({
      name: "CLOUD_KEY",
      configured: true,
    })
    expect(service.resolve(record)).toEqual({ CLOUD_KEY: "first-private-value" })
    await service.set("project", "CLOUD_KEY", "second-private-value")
    const reopened = createProjectSecrets({
      store: createProjectSecretStore(root),
      worktrees,
      fallback: {},
    })
    expect(reopened.resolve(record)).toEqual({ CLOUD_KEY: "first-private-value" })
    expect(reopened.resolve({ ...record, id: "next-execution" })).toEqual({
      CLOUD_KEY: "second-private-value",
    })
    expect(await reopened.list("other-project")).toEqual([
      { name: "CLOUD_KEY", configured: false },
      { name: "TEST_KEY", configured: false },
    ])
    await expect(service.set("project", "UNDECLARED", "value")).rejects.toThrow("not declared")
    await service.set("project", "CLOUD_KEY", "")
    expect(() => reopened.resolve({ ...record, id: "missing-execution" })).toThrow(
      "Enter required secret",
    )
    expect(
      reopened.resolve({
        ...record,
        id: "mock-execution",
        plan: { ...record.plan, requiredSecrets: [] },
      }),
    ).toEqual({})
    const file = join(root, "private-secrets", "project-project.json")
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("an explicit blank overrides server env instead of silently restoring a key", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-secret-test-"))
  try {
    const store = createProjectSecretStore(root)
    const settings = settingsSchema.parse({ tests: { env: { API_KEY: { secret: "API_KEY" } } } })
    const service = createProjectSecrets({
      store,
      fallback: { API_KEY: "server-key" },
      worktrees: {
        projectSettings: async () => ({
          projectRoot: root,
          read: async () => ({ valid: true, file: "settings.json", issues: [], settings }),
        }),
      },
    })
    expect(await service.list("project")).toEqual([{ name: "API_KEY", configured: true }])
    await service.set("project", "API_KEY", "")
    expect(await service.list("project")).toEqual([{ name: "API_KEY", configured: false }])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
