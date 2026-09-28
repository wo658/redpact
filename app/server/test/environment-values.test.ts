import { expect, test } from "vitest"
import { executionSettingsSchema } from "../src/core/execution-settings.js"
import { runnerEnvironment } from "../src/core/runner-environment.js"
import type { Environment } from "../src/core/types/environment.js"
import { createEnvironments } from "../src/workflows/environments.js"

function fixture() {
  const settings = executionSettingsSchema.parse({
    environment: { compose: { files: [] } },
    tests: {
      env: {
        TOKEN: { value: "runner-private" },
        EMPTY: { value: "" },
        URL: { service: "app", port: 3000, value: "url", scheme: "http" },
      },
    },
  })
  const record = {
    settings,
    plan: {
      activeServices: ["app"],
      bindings: {
        app: {
          TOKEN: { value: "app-private" },
          SHARED: { value: "runner-private" },
          EMPTY: { value: "" },
          REMOVED: { unset: true },
        },
      },
      requiredSecrets: ["LEGACY"],
      excludedServices: [],
      prerequisites: {},
      reasons: {},
    },
  } as Pick<Environment, "settings" | "plan">
  const service = createEnvironments({
    store: { getEnvironment: () => record },
    secrets: { LEGACY: "legacy-private", UNRELATED: "not-injected" },
  } as never)
  return { settings, record, service }
}

test("직접 저장한 앱·테스트 값과 기존 참조 값만 마스킹 대상으로 고정한다", async () => {
  const { service } = fixture()
  expect(await service.secretValues("environment")).toEqual(
    expect.arrayContaining(["app-private", "runner-private", "legacy-private"]),
  )
  expect(await service.secretValues("environment")).not.toContain("")
  expect(await service.secretValues("environment")).not.toContain("not-injected")
  expect(await service.secretValues("environment")).not.toContain("http://app.redpact.test:3000")
})

test("앱 값은 테스트 러너로 상속하지 않고 빈 문자열을 유지한다", () => {
  const { settings } = fixture()
  expect(runnerEnvironment(settings, { LEGACY: "legacy-private" })).toEqual({
    TOKEN: "runner-private",
    EMPTY: "",
    URL: "http://app.redpact.test:3000",
  })
})
