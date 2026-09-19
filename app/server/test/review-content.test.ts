import { expect, test, vi } from "vitest"
import type { CaptureRun } from "../src/core/types/playwright.js"
import { reviewContentRoutes } from "../src/interfaces/http/review-content.js"
import { createReviewContent } from "../src/workflows/review-content.js"

function fixture() {
  const changedPaths = vi.fn(async () => [] as string[])
  const discover = vi.fn(async () => [
    {
      path: "worktree/screen.ts",
      target: "screens",
      purpose: "capture" as const,
      scope: "worktree" as const,
    },
  ])
  const captures: CaptureRun[] = []
  const state = { active: false }
  const project = vi.fn(async () => ({
    file: "settings.json",
    source: null,
    revision: null,
    value: {
      tests: { directory: "tests" },
      playwright: {
        service: "app",
        port: 80,
        targets: {
          screens: { purpose: "capture", scope: "worktree", testMatch: ["worktree/*.ts"] },
        },
      },
    },
    issues: [] as string[],
  }))
  const service = createReviewContent({
    worktrees: {
      resolve: vi.fn(async () => ({
        worktree: { projectId: "project", projectRoot: "/project" },
        git: { mergeBase: async () => "base" },
      })),
    } as never,
    projects: { tracking: async () => ({ mainBranch: "main" }) } as never,
    settings: { project },
    changedPaths,
    discover,
    captures: () => captures,
    unitExists: () => false,
    integrationActive: () => state.active,
    logExists: () => true,
    environmentExists: () => false,
  })
  return { service, changedPaths, discover, captures, state, project }
}

test("완료된 과거 기록만 있으면 빈 Integration 탭을 숨기고 로그는 유지한다", async () => {
  const f = fixture()
  const response = await reviewContentRoutes(f.service).request(
    "http://localhost/worktrees/wt/review-content",
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    preview: true,
    unit: false,
    tests: false,
    log: true,
    environment: false,
  })
  expect(f.changedPaths).toHaveBeenCalledTimes(1)
})

test("변경된 Integration 경로나 실행 중 기록은 내용으로 인정한다", async () => {
  const f = fixture()
  f.changedPaths.mockResolvedValue(["tests/example.test.ts"])
  expect((await f.service.inspect("wt")).tests).toBe(true)
  f.changedPaths.mockResolvedValue(["other/example.test.ts"])
  expect((await f.service.inspect("wt")).tests).toBe(false)
  f.state.active = true
  expect((await f.service.inspect("wt")).tests).toBe(true)
})

test("Git 조회 실패와 설정 오류는 진단 탭을 숨기지 않는다", async () => {
  const f = fixture()
  f.changedPaths.mockRejectedValue(new Error("Git unavailable"))
  expect((await f.service.inspect("wt")).tests).toBe(true)
  f.project.mockResolvedValue({ ...(await f.project()), issues: ["Invalid settings"] })
  expect(await f.service.inspect("wt")).toMatchObject({ tests: true, unit: true, preview: true })
})

test("최신 캡처에 이미지가 없어도 캡처 소스와 진단에 접근한다", async () => {
  const f = fixture()
  const run = (images: boolean, width = 1920) =>
    ({
      purpose: "capture",
      target: "screens",
      state: "finished",
      after: {
        cases: [
          {
            file: "worktree/screen.ts",
            artifacts: images ? [{ contentType: "image/png", viewport: { width } }] : [],
          },
        ],
      },
    }) as unknown as CaptureRun
  f.captures.push(run(true))
  expect((await f.service.inspect("wt")).preview).toBe(true)
  f.captures.unshift(run(false))
  expect((await f.service.inspect("wt")).preview).toBe(true)
  f.captures.unshift(run(true, 390))
  expect((await f.service.inspect("wt")).preview).toBe(true)
})

test("캡처 초안만 있어도 실행 전에 UI Review를 연다", async () => {
  const f = fixture()
  expect(f.captures).toHaveLength(0)
  expect((await f.service.inspect("wt")).preview).toBe(true)
})

test("캡처 소스가 없으면 빈 UI Review를 숨긴다", async () => {
  const f = fixture()
  f.discover.mockResolvedValue([])
  expect((await f.service.inspect("wt")).preview).toBe(false)
})
