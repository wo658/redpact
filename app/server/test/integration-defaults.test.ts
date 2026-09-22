import { expect, test } from "vitest"
import { defaultIntegrationSelection } from "../src/core/integration-defaults.js"
import { settingsSchema } from "../src/core/settings-schema.js"

test("고정 실행 입력은 설정에 없는 서비스를 자동으로 선택하지 않는다", () => {
  const settings = settingsSchema.parse({
    services: ["app"],
    dependencies: { db: { kind: "isolated", services: ["db"] } },
  })
  expect(defaultIntegrationSelection(settings, ["app", "db", "worker"])).toEqual({
    services: ["app"],
    select: { db: "isolated" },
  })
})
test("빈 설정은 실행 시작 서비스를 추측하지 않는다", () => {
  expect(defaultIntegrationSelection(settingsSchema.parse({}), ["app"])).toEqual({
    services: [],
    select: {},
  })
})
