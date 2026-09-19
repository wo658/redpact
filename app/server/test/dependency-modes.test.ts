import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { parse } from "yaml"
import { stageSelection } from "../src/adapters/environment/selection.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { executionSettingsSchema } from "../src/core/execution-settings.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { TestSelection } from "../src/core/types/settings.js"

const roots: string[] = []
it("allows ordinary literal keys and passwords without forcing secret references", async () => {
  const reader = await fixture({
    composeFiles: ["compose.yaml"],
    dependencies: {
      auth: { modes: { mock: { env: { app: { API_KEY: "local-key", PASSWORD: "" } } } } },
    },
    tests: { env: { API_TOKEN: "test-token" } },
  })
  const result = await reader.read({ services: ["app"], select: { auth: "mock" } })
  expect(result.issues).toEqual([])
  expect(result.plan?.bindings.app.API_KEY).toEqual({ value: "local-key" })
})
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const configuration = {
  composeFiles: ["compose.yaml"],
  dependencies: {
    payments: {
      modes: {
        isolated: {
          services: ["payments"],
          env: { app: { PAYMENTS_URL: "http://payments:8080" } },
        },
        mock: {
          env: {
            app: { PAYMENTS_MODE: "mock" },
            worker: { PAYMENT_BACKEND: "stub", STALE: { unset: true } },
          },
        },
        remote: { env: { app: { PAYMENTS_API_KEY: { secret: "CLOUD_KEY" } } } },
      },
    },
  },
  tests: { env: { APP_URL: { service: "app", port: 3000, scheme: "http" } } },
}
async function fixture(value: unknown = configuration) {
  const root = await mkdtemp(join(tmpdir(), "redpact-modes-"))
  roots.push(root)
  await mkdir(join(root, ".redpact"))
  await writeFile(join(root, ".redpact/settings.json"), JSON.stringify(value, null, 2))
  await writeFile(
    join(root, "compose.yaml"),
    `services:
  app:
    image: example/app
    ports: ["3000"]
    environment:
      PAYMENTS_MODE: real
      KEEP: original
  worker:
    image: example/worker
  payments:
    image: example/payments
    ports: ["8080"]
    depends_on: [db]
  db:
    image: example/db
`,
  )
  return createSettingsService(root)
}
it("accepts one dependency catalog without version, server slots or imports", () => {
  expect(settingsSchema.safeParse(configuration).success).toBe(true)
  for (const field of [{ version: 4 }, { imports: [] }]) {
    expect(settingsSchema.safeParse({ ...configuration, ...field }).success).toBe(false)
  }
})
it("applies different app contracts and preserves omitted Compose defaults", async () => {
  const reader = await fixture()
  const result = await reader.read({
    services: ["app", "worker"],
    select: { payments: "mock" },
  })
  expect(result.issues).toEqual([])
  expect(result.plan?.activeServices).toEqual(["app", "worker"])
  expect(result.plan?.bindings).toEqual({
    app: { PAYMENTS_MODE: { value: "mock" } },
    worker: { PAYMENT_BACKEND: { value: "stub" }, STALE: { unset: true } },
  })
  expect(result.plan?.requiredSecrets).toEqual([])
})
it("starts selected containers and fixed prerequisites without consumer wait edges", async () => {
  const result = await (await fixture()).read({
    services: ["app"],
    select: { payments: "isolated" },
  })
  expect(result.issues).toEqual([])
  expect(result.plan?.activeServices).toEqual(["app", "db", "payments"])
  expect(result.plan?.prerequisites.app).toEqual({})
  expect(result.plan?.bindings.app).toEqual({ PAYMENTS_URL: { value: "http://payments:8080" } })
})
it("rejects inactive injection targets and conflicting selected writes", async () => {
  const reader = await fixture()
  expect(
    (await reader.read({ services: ["app"], select: { payments: "mock" } })).issues.some(
      (i) => i.code === "inactive_target",
    ),
  ).toBe(true)
  const value = {
    ...configuration,
    dependencies: {
      ...configuration.dependencies,
      llm: { modes: { mock: { env: { app: { PAYMENTS_MODE: "other" } } } } },
    },
  }
  const result = await (await fixture(value)).read({
    services: ["app", "worker"],
    select: { payments: "mock", llm: "mock" },
  })
  expect(result.issues.some((i) => i.code === "binding_conflict")).toBe(true)
})
it("reports duplicate JSON keys and never falls back to YAML", async () => {
  const reader = await fixture()
  await writeFile(
    join(reader.projectRoot, ".redpact/settings.json"),
    '{"composeFiles":[],"composeFiles":[]}',
  )
  expect((await reader.read()).issues[0].message).toContain("Duplicate")
  await rm(join(reader.projectRoot, ".redpact/settings.json"))
  await writeFile(
    join(reader.projectRoot, ".redpact/settings.yaml"),
    "version: 1\ndependencies: []\n",
  )
  expect((await reader.read()).valid).toBe(false)
})

it("stages array and map defaults while replacing unresolved inputs and explicit unsets", async () => {
  const reader = await fixture()
  await writeFile(
    join(reader.projectRoot, "compose.yaml"),
    `services:
  app:
    image: example/app
    ports: [3000]
    environment: ["PAYMENTS_MODE=$\{UNAVAILABLE:?required}", "KEEP=original"]
  worker:
    image: example/worker
    environment: { STALE: old }
  payments:
    image: example/payments
`,
  )
  const result = await reader.read({ services: ["app", "worker"], select: { payments: "mock" } })
  expect(result.issues).toEqual([])
  const staged = await stageSelection(
    reader.projectRoot,
    {
      plan: result.plan!,
      settings: executionSettingsSchema.parse({
        environment: { compose: { files: ["compose.yaml"] } },
        tests: {},
      }),
    },
    {},
  )
  const base = parse(await readFile(join(reader.projectRoot, staged.files[0]), "utf8"))
  const overrides = parse(
    await readFile(join(reader.projectRoot, staged.files[staged.files.length - 1]), "utf8"),
  )
  expect(base.services.app.environment).toEqual({ KEEP: "original" })
  expect(base.services.worker.environment).toEqual({})
  expect(overrides.services.app.environment).toEqual({ PAYMENTS_MODE: "mock" })
  expect(overrides.services.worker.environment.STALE).toBeNull()
  expect(staged.variables).toEqual({})
})
it("rejects unknown references, incomplete selections, bounded input and symbolic links", async () => {
  const reader = await fixture()
  for (const selection of [
    { services: ["app"], select: {} },
    { services: ["missing"], select: { payments: "isolated" } },
    { services: ["app"], select: { payments: "unknown" } },
  ] as TestSelection[]) {
    expect((await reader.read(selection)).valid).toBe(false)
  }
  const unknown = structuredClone(configuration)
  unknown.dependencies.payments.modes["isolated"].services = ["missing"]
  await writeFile(
    join(reader.projectRoot, ".redpact/settings.json"),
    JSON.stringify(unknown, null, 2),
  )
  const invalid = await reader.read()
  expect(invalid.issues[0]).toMatchObject({
    code: "unknown_reference",
    path: "dependencies.payments.modes.isolated.services",
  })
  expect(invalid.issues[0].line).toBeGreaterThan(1)
  await writeFile(join(reader.projectRoot, ".redpact/settings.json"), " ".repeat(256 * 1024 + 1))
  expect((await reader.read()).issues[0].code).toBe("size")
  await rm(join(reader.projectRoot, ".redpact/settings.json"))
  await symlink(
    join(reader.projectRoot, "compose.yaml"),
    join(reader.projectRoot, ".redpact/settings.json"),
  )
  expect((await reader.read()).issues[0].code).toBe("path")
})

it("allows app environment names while protecting the host test runner", () => {
  const value = {
    composeFiles: ["compose.yaml"],
    dependencies: {
      runtime: {
        modes: { mock: { env: { app: { NODE_ENV: "test", PATH: "/app/bin:/usr/bin" } } } },
      },
    },
  }
  expect(settingsSchema.safeParse(value).success).toBe(true)
  expect(
    settingsSchema.safeParse({ ...value, tests: { env: { NODE_OPTIONS: "--require=./hook.js" } } })
      .success,
  ).toBe(false)
})

it("supports all four modes and keeps shared connections outside environment ownership", async () => {
  const modes = {
    isolated: { services: ["payments"] },
    "shared-local": { env: { app: { PAYMENTS_URL: "http://host.docker.internal:8080" } } },
    remote: { env: { app: { PAYMENTS_URL: "https://payments.example.test" } } },
    mock: { env: { app: { PAYMENTS_MODE: "mock" } } },
  }
  const reader = await fixture({
    composeFiles: ["compose.yaml"],
    dependencies: { payments: { modes } },
  })
  for (const mode of Object.keys(modes)) {
    const result = await reader.read({ services: ["app"], select: { payments: mode } })
    expect(result.issues).toEqual([])
    expect(result.plan?.activeServices).toEqual(
      mode === "isolated" ? ["app", "db", "payments"] : ["app"],
    )
  }
})
it("rejects provisioning for both connection modes and requires services for isolated", () => {
  for (const mode of ["shared-local", "remote"]) {
    expect(
      settingsSchema.safeParse({
        dependencies: { api: { modes: { [mode]: { services: ["api"] } } } },
      }).success,
    ).toBe(false)
  }
  expect(
    settingsSchema.safeParse({ dependencies: { api: { modes: { isolated: {} } } } }).success,
  ).toBe(false)
})
