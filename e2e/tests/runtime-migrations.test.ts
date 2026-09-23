import { expect, test } from "vitest"
import { type MigrationResult, migrationFixture } from "./migration-fixture"
import { createSteps } from "./steps"
import { node } from "./target"

for (const scenario of ["legacy", "resume"]) {
  test(`구형 환경 기록을 보존하며 시작하고 재실행해도 변환을 반복하지 않는다 (${scenario})`, async (context) => {
    const step = createSteps(context)
    const result = await step("구형 또는 변환 중단 상태에서 실제 CLI를 두 번 시작한다", () =>
      node<MigrationResult>(migrationFixture, { scenario }),
    )
    await step("HTTP 환경 조회가 복구된 고정 의존성을 반환한다", () => {
      expect(result.first.status, result.first.output).toBe(200)
      expect(result.first.records[0]?.specification.dependencies.payments.kind).toBe("mock")
      expect(result.second?.status).toBe(200)
    })
    await step("원본 백업과 적용 이력이 유지되고 설정과 반복 시작 결과가 보존된다", () => {
      expect(result.backup).toBe(result.original)
      expect(JSON.parse(result.log ?? "null")).toEqual(["001-fixed-environment-settings"])
      expect(result.unchangedAfterRestart).toBe(true)
      expect(result.settingsUnchanged).toBe(true)
      expect(result.locked).toBe(false)
    })
  })
}

for (const scenario of ["invalid", "future"]) {
  test(`추측이 필요한 기록과 미래 버전은 원본을 변경하지 않고 진단한다 (${scenario})`, async (context) => {
    const step = createSteps(context)
    const result = await step("선택 누락 또는 미래 마이그레이션 이력을 가진 앱을 시작한다", () =>
      node<MigrationResult>(migrationFixture, { scenario }),
    )
    await step("구체적인 마이그레이션 오류를 반환하고 원본과 잠금을 보존한다", () => {
      expect(result.first.code).toBe(1)
      expect(result.first.output).toContain(
        scenario === "future"
          ? "Unsupported runtime migration history"
          : "Missing captured dependency selection",
      )
      expect(result.after).toBe(result.original)
      expect(result.settingsUnchanged).toBe(true)
      expect(result.locked).toBe(false)
      if (scenario === "invalid") {
        expect(result.log).toBeNull()
      }
    })
  })
}
