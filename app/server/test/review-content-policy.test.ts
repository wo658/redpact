import { expect, test } from "vitest"
import { hasReviewCaptures, reviewContentFromChanges } from "../src/core/review-content.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { PlaywrightFile } from "../src/core/types/playwright.js"

const settings = settingsSchema.parse({
  tests: { directory: "integration" },
  unitTests: { patterns: ["src/**/*.test.ts"], command: "pnpm test", dockerfile: "Dockerfile" },
  playwright: {
    service: "app",
    port: 80,
    targets: { screens: { purpose: "capture", scope: "worktree", testMatch: ["*.ts"] } },
  },
})
const empty = { preview: false, unit: false, tests: false, log: true, environment: false }
const file: PlaywrightFile = {
  path: "screen.ts",
  target: "screens",
  purpose: "capture",
  scope: "worktree",
}
test("변경 경로의 기능별 패턴을 판정하고 기존 내용과 입력을 보존한다", () => {
  expect(
    reviewContentFromChanges(empty, ["integration/helper.json", "src/a.test.ts"], settings),
  ).toEqual({ ...empty, unit: true, tests: true })
  expect(
    reviewContentFromChanges(empty, ["integration-other/a.ts", "integration/README.md"], settings),
  ).toEqual(empty)
  expect(reviewContentFromChanges({ ...empty, tests: true }, [], settings).tests).toBe(true)
  expect(empty.unit).toBe(false)
})

test("캡처 소스만으로 실행 전과 이미지 없는 상태의 리뷰를 표시한다", () => {
  const playwright = settings.playwright
  if (!playwright) {
    throw new Error("Missing Playwright settings")
  }
  expect(hasReviewCaptures([file], [], playwright)).toBe(true)
  expect(hasReviewCaptures([], [], playwright)).toBe(false)
})

test("프로젝트 캡처는 변경 파일만 포함하고 기능 테스트는 제외한다", () => {
  const playwright = settings.playwright
  if (!playwright) {
    throw new Error("Missing Playwright settings")
  }
  const projectFile = { ...file, scope: "project" as const }
  expect(hasReviewCaptures([projectFile], [], playwright)).toBe(false)
  expect(hasReviewCaptures([projectFile], [`${playwright.directory}/screen.ts`], playwright)).toBe(
    true,
  )
  expect(hasReviewCaptures([{ ...file, purpose: "functional" }], [], playwright)).toBe(false)
})
