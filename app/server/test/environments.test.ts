import { expect, test } from "vitest"
import { settingsSchema } from "../src/core/settings-schema.js"

const composeSettings = {
  composeFiles: ["compose.yaml"],
  tests: { env: { APP_BASE_URL: { service: "app", port: 3000, scheme: "http" } } },
  services: ["app"],
}
test("rejects reserved variables and retired format fields", () => {
  expect(settingsSchema.safeParse(composeSettings).success).toBe(true)
  expect(settingsSchema.safeParse({ ...composeSettings, version: 2 }).success).toBe(false)
  expect(
    settingsSchema.safeParse({ ...composeSettings, tests: { env: { REDPACT_TOKEN: "bad" } } })
      .success,
  ).toBe(false)
})

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSettingsService } from "../src/adapters/settings/json.js"

test("configure validation rejects Compose isolation violations without contacting Docker", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-compose-schema-"))
  try {
    await mkdir(join(root, ".redpact"))
    await writeFile(join(root, ".redpact/settings.json"), JSON.stringify(composeSettings))
    await writeFile(
      join(root, "compose.yaml"),
      "services:\n  app:\n    image: alpine:3.21\n    container_name: shared\n",
    )
    const result = await createSettingsService(root).read()
    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes("container_name"))).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

import { createApp } from "../src/app.js"

test("does not expose standalone environment preparation over HTTP", async () => {
  const record = { id: "00000000-0000-4000-8000-000000000001", state: "preparing" }
  const app = createApp({
    environments: { prepare: async () => record },
    stopEnvironment: async () => record,
  } as never)
  const response = await app.request("/api/environments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      worktreeId: "00000000-0000-4000-8000-000000000002",
      requestId: "00000000-0000-4000-8000-000000000003",
      selection: { services: ["app"], select: {} },
      expectedSettingsDigest: "a".repeat(64),
    }),
  })
  expect(response.status).toBe(404)
})

import { createTestVitestRunner as createVitestRunner } from "./helpers/container-runner.js"

test.runIf(process.env.REDPACT_DOCKER_TESTS === "1")(
  "injects declared runner variables and excludes server secrets",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-env-runner-"))
    process.env.REDPACT_TEST_SENTINEL_SECRET = "do-not-inherit"
    try {
      const runner = createVitestRunner(root)
      const result = await runner.execute(
        {
          files: [
            {
              path: "env.test.ts",
              source:
                'import { test, expect } from "vitest"; test("explicit environment", () => { expect(process.env.APP_BASE_URL).toBe("http://example.test"); expect(process.env.REDPACT_TEST_SENTINEL_SECRET).toBeUndefined() })',
            },
          ],
        } as never,
        "injection",
        new AbortController().signal,
        undefined,
        { APP_BASE_URL: "http://example.test" },
      )
      expect(result.outcome).toBe("passed")
    } finally {
      delete process.env.REDPACT_TEST_SENTINEL_SECRET
      await rm(root, { recursive: true, force: true })
    }
  },
  15000,
)

import { openStore } from "../src/adapters/storage/files.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { storageTarget } from "./helpers/storage.js"

test("accepts a standard pinned test manifest and lockfile in the immutable submission", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-env-package-"))
  const storage = openStore(root)
  try {
    const submissions = createSubmissions({
      store: storage.store,
      runnerVersion: "test",
      parse: () => ({ scenarios: [], limitations: [] }),
    })
    const target = storageTarget(storage.store, root)
    const work = submissions.createWorkItem("Use the DB driver", target.worktreeId)
    expect(() =>
      submissions.submit(work.id, [
        {
          path: "package.json",
          source: JSON.stringify({
            private: true,
            packageManager: "pnpm@11.2.2",
            dependencies: { pg: "8.16.3" },
          }),
        },
        { path: "pnpm-lock.yaml", source: "lockfileVersion: '9.0'\n" },
        { path: "db.test.ts", source: "" },
      ]),
    ).not.toThrow()
  } finally {
    storage.close()
    await rm(root, { recursive: true, force: true })
  }
})
