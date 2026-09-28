import { expect, test } from "vitest"
import { executionSettingsSchema } from "../src/core/execution-settings.js"
import type { Environment } from "../src/core/types/environment.js"
import { createEnvironments } from "../src/workflows/environments.js"

function fixture() {
  const settings = executionSettingsSchema.parse({
    environment: { compose: { files: [] } },
    tests: {
      env: {
        TOKEN: "runner-private",
        EMPTY: "",
        URL: "http://app.redpact.test:3000",
      },
    },
  })
  const record = {
    settings,
    plan: {
      activeServices: ["app"],
      bindings: {
        app: {
          TOKEN: "app-private",
          SHARED: "runner-private",
          EMPTY: "",
          REMOVED: { unset: true },
        },
      },
      excludedServices: [],
      prerequisites: {},
      reasons: {},
    },
  } as Pick<Environment, "settings" | "plan">
  const service = createEnvironments({
    store: { getEnvironment: () => record },
  } as never)
  return { settings, record, service }
}

test("직접 저장한 앱·테스트 값만 마스킹 대상으로 고정한다", async () => {
  const { service } = fixture()
  expect(await service.redactionValues("environment")).toEqual(
    expect.arrayContaining(["app-private", "runner-private"]),
  )
  expect(await service.redactionValues("environment")).not.toContain("")
  expect(await service.redactionValues("environment")).not.toContain("not-injected")
  expect(await service.redactionValues("environment")).toContain("http://app.redpact.test:3000")
})

test("앱 값은 테스트 러너로 상속하지 않고 빈 문자열을 유지한다", () => {
  const { settings } = fixture()
  expect(settings.tests.env).toEqual({
    TOKEN: "runner-private",
    EMPTY: "",
    URL: "http://app.redpact.test:3000",
  })
})

test("새 설정은 별도 secret 참조를 거부하고 원문 값만 허용한다", async () => {
  const { settingsSchema } = await import("../src/core/settings-schema.js")
  expect(settingsSchema.safeParse({ tests: { env: { TOKEN: { secret: "TOKEN" } } } }).success).toBe(
    false,
  )
  expect(
    settingsSchema.safeParse({
      dependencies: { provider: { kind: "remote", env: { app: { TOKEN: { secret: "TOKEN" } } } } },
    }).success,
  ).toBe(false)
  expect(settingsSchema.safeParse({ tests: { env: { TOKEN: "direct", EMPTY: "" } } }).success).toBe(
    true,
  )
})

test("host·port·URL 바인딩도 해석하지 않고 문자열 key-value만 저장한다", async () => {
  const { settingsSchema } = await import("../src/core/settings-schema.js")
  for (const value of [
    { service: "app", port: 3000, scheme: "http" },
    { service: "app", port: 3000, value: "host" },
    { secret: "TOKEN" },
  ]) {
    expect(settingsSchema.safeParse({ tests: { env: { TARGET: value } } }).success).toBe(false)
  }
  expect(
    settingsSchema.parse({
      tests: {
        env: { HOST: "app.redpact.test", PORT: "3000", URL: "http://app.redpact.test:3000" },
      },
    }).tests.env,
  ).toEqual({ HOST: "app.redpact.test", PORT: "3000", URL: "http://app.redpact.test:3000" })
})
