import { expect, test } from "vitest"
import { planContainers } from "../src/core/container-plan.js"
import { settingsSchema } from "../src/core/settings-schema.js"

const fixed = {
  composeFiles: ["compose.yaml"],
  services: ["app"],
  dependencies: {
    database: { kind: "isolated", services: ["db"] },
    payments: { kind: "mock", services: ["payments"] },
    search: {
      kind: "shared-local",
      env: { app: { SEARCH_URL: "http://host.docker.internal:9200" } },
    },
    remote: { kind: "remote", env: { app: { API_KEY: { secret: "API_KEY" } } } },
  },
  tests: { env: { APP_URL: { service: "app", port: 3000, scheme: "http" } } },
}

test("고정 설정은 선택 없이 관리 서비스와 외부 연결의 실행 계획을 만든다", () => {
  const parsed = settingsSchema.safeParse(fixed)
  expect(parsed.success).toBe(true)
  if (!parsed.success) {
    return
  }
  const result = planContainers(parsed.data, {
    services: {
      app: { image: "app", ports: [{ target: 3000 }] },
      db: { image: "postgres" },
      payments: { image: "mock" },
      unused: { image: "unused" },
    },
  })
  expect(result.issues).toEqual([])
  expect(result.plan?.activeServices).toEqual(["app", "db", "payments"])
  expect(result.plan?.requiredSecrets).toEqual(["API_KEY"])
})

test("모드 카탈로그와 외부 연결의 컨테이너 선언을 거부한다", () => {
  expect(
    settingsSchema.safeParse({
      dependencies: { db: { modes: { isolated: { services: ["db"] } } } },
    }).success,
  ).toBe(false)
  expect(
    settingsSchema.safeParse({
      ...fixed,
      dependencies: { search: { kind: "remote", services: ["search"] } },
    }).success,
  ).toBe(false)
})
