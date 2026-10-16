import { expect, test } from "vitest"
import { applyHostPorts } from "../src/core/manual-ports.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { Environment } from "../src/core/types/environment.js"

test("의존성 고정 포트는 서비스와 내부 포트를 명시한 설정으로 검증한다", () => {
  const input = {
    services: ["app"],
    dependencies: {
      database: {
        kind: "isolated",
        services: ["db"],
        hostPorts: [{ service: "db", target: 5432, published: 15432 }],
      },
    },
  }
  expect(settingsSchema.safeParse(input).success).toBe(true)
})

test.each([
  { service: "external", target: 5432, published: 15432 },
  { service: "db", target: 5432, published: 0 },
])("외부 서비스와 범위 밖 호스트 포트는 거부한다: %j", (port) => {
  expect(
    settingsSchema.safeParse({
      dependencies: { database: { kind: "isolated", services: ["db"], hostPorts: [port] } },
    }).success,
  ).toBe(false)
})

test("고정 포트는 메인 수동 환경에만 적용하고 입력 모델을 변경하지 않는다", () => {
  const model = {
    services: {
      db: {
        image: "postgres:17-alpine",
        network_mode: undefined,
        ports: [{ target: 5432, published: "9999" }],
      },
    },
  }
  const specification = settingsSchema.parse({
    dependencies: {
      database: {
        kind: "isolated",
        services: ["db"],
        hostPorts: [{ service: "db", target: 5432, published: 15432 }],
      },
    },
  })
  for (const [lifecycle, manualScope, expected] of [
    ["manual", "main", "15432"],
    ["manual", "worktree", "0"],
    ["run", "main", "0"],
  ] as const) {
    const result = applyHostPorts(model, { lifecycle, manualScope, specification } as Environment)
    expect(result.services.db.ports?.[0].published).toBe(expected)
  }
  expect(model.services.db.ports[0].published).toBe("9999")
})
