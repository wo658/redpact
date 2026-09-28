import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { createRuntimeMigrationFiles } from "../src/adapters/storage/migrations.js"
import { migrateRuntime } from "../src/workflows/runtime-migrations.js"

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture(captured = true) {
  const root = await mkdtemp(join(tmpdir(), "flat-migration-"))
  roots.push(root)
  const id = randomUUID()
  const reference = { secret: "TOKEN" }
  const record = {
    version: 1,
    data: {
      id,
      requestId: randomUUID(),
      ownerId: randomUUID(),
      target: {
        projectId: "project",
        worktreeId: "worktree",
        projectRoot: root,
        checkoutRoot: root,
      },
      projectName: `redpact-${id}`,
      settings: {
        environment: { compose: { files: [] }, variables: {} },
        tests: { env: { TOKEN: reference } },
      },
      specification: {
        services: ["app"],
        dependencies: { provider: { kind: "remote", env: { app: { TOKEN: reference } } } },
        tests: { env: { TOKEN: reference } },
      },
      selection: { services: ["app"], select: { provider: "remote" } },
      plan: {
        activeServices: ["app"],
        excludedServices: [],
        bindings: { app: { TOKEN: reference } },
        prerequisites: {},
        reasons: {},
        requiredSecrets: ["TOKEN"],
      },
      bundle: [],
      settingsDigest: createHash("sha256").update("[]").digest("hex"),
      inputDigest: "original",
      state: "stopped",
      lifecycle: "run",
      runIds: [],
      resources: [],
      endpoints: {},
      services: [],
      errors: [],
      createdAt: "original",
      updatedAt: "original",
    },
  }
  const original = JSON.stringify(record)
  await mkdir(join(root, "environments"))
  await mkdir(join(root, ".migrations"))
  await mkdir(join(root, "private-secrets"))
  await writeFile(
    join(root, ".migrations/completed.json"),
    JSON.stringify(["001-fixed-environment-settings"]),
  )
  await writeFile(join(root, `environments/${id}.json`), original)
  if (captured) {
    await writeFile(
      join(root, `private-secrets/environment-${id}.json`),
      JSON.stringify({ version: 1, data: { TOKEN: "captured-original" } }),
    )
  }
  await writeFile(
    join(root, "private-secrets/project-project.json"),
    JSON.stringify({ version: 1, data: { TOKEN: "new-project-value" } }),
  )
  return { root, id, original, files: createRuntimeMigrationFiles(root) }
}

test("과거 실행은 캡처된 값으로만 변환하고 원본과 비공개 파일을 보존한다", async () => {
  const { root, id, original, files } = await fixture()
  await migrateRuntime(files)
  const current = JSON.parse(await readFile(join(root, `environments/${id}.json`), "utf8"))
  expect(current.data.plan.bindings.app.TOKEN).toBe("captured-original")
  expect(current.data.settings.tests.env.TOKEN).toBe("captured-original")
  expect(current.data.specification.dependencies.provider.env.app.TOKEN).toBe("captured-original")
  expect(current.data.settingsDigest).toBe(JSON.parse(original).data.settingsDigest)
  expect(
    await readFile(
      join(root, `.migrations/backups/002-flat-environment-values/environments/${id}.json`),
      "utf8",
    ),
  ).toBe(original)
  expect(
    JSON.parse(await readFile(join(root, "private-secrets/project-project.json"), "utf8")).data
      .TOKEN,
  ).toBe("new-project-value")
  const saved = await readFile(join(root, `environments/${id}.json`), "utf8")
  await migrateRuntime(files)
  expect(await readFile(join(root, `environments/${id}.json`), "utf8")).toBe(saved)
})

test("캡처된 값이 없으면 현재 프로젝트나 서버 값으로 추측하지 않고 원본을 유지한다", async () => {
  const { root, id, original, files } = await fixture(false)
  await expect(migrateRuntime(files)).rejects.toThrow("Missing captured environment value: TOKEN")
  expect(await readFile(join(root, `environments/${id}.json`), "utf8")).toBe(original)
  expect(await files.history()).toEqual(["001-fixed-environment-settings"])
})

test("변환 후 기록 저장이 중단되어도 원본 백업에서 재시도한다", async () => {
  const { root, id, original, files } = await fixture()
  await expect(
    migrateRuntime({
      ...files,
      recordHistory: async () => {
        throw new Error("interrupted")
      },
    }),
  ).rejects.toThrow("interrupted")
  await migrateRuntime(files)
  expect(
    JSON.parse(await readFile(join(root, `environments/${id}.json`), "utf8")).data.settings.tests
      .env.TOKEN,
  ).toBe("captured-original")
  expect(
    await readFile(
      join(root, `.migrations/backups/002-flat-environment-values/environments/${id}.json`),
      "utf8",
    ),
  ).toBe(original)
})

test("과거 host·port·URL과 빈 문자열은 당시 러너 규칙대로 변환한다", async () => {
  const { root, id, files } = await fixture()
  const path = join(root, `environments/${id}.json`)
  const record = JSON.parse(await readFile(path, "utf8"))
  const env = {
    HOST: { service: "app", port: 443, value: "host" },
    PORT: { service: "app", port: 443, value: "port" },
    URL: { service: "app", port: 443, scheme: "https", value: "url" },
    EMPTY: { value: "" },
  }
  record.data.settings.tests.env = env
  record.data.specification.tests.env = { ...env, EMPTY: "" }
  await writeFile(path, JSON.stringify(record))
  await migrateRuntime(files)
  const current = JSON.parse(await readFile(path, "utf8"))
  expect(current.data.settings.tests.env).toEqual({
    HOST: "app.redpact.test",
    PORT: "443",
    URL: "https://app.redpact.test:443",
    EMPTY: "",
  })
  expect(current.data.specification.tests.env).toEqual(current.data.settings.tests.env)
  expect(current.data.plan).not.toHaveProperty("requiredSecrets")
})
