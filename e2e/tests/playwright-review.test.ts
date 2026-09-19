import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, rpc } from "./target"

/** 제거한 렌더러 계약과 새 실제 앱 캡처 계약을 공개 API로 구분한다. */
test("스토리보드 API는 사라지고 Playwright 실행 설정이 공개된다", async (context) => {
  const step = createSteps(context)
  await step("기존 스토리보드 API가 더 이상 제공되지 않는지 확인한다", async () => {
    for (const path of [
      "/api/storyboard/schema",
      "/api/worktrees/removed/storyboard",
      "/api/projects/removed/storyboard/configuration",
    ]) {
      expect((await http(path)).status).toBe(404)
    }
  })
  await step("실행 서버가 Playwright 설정과 증거 조회 계약을 안내하는지 확인한다", async () => {
    const result = await rpc("tools/call", {
      name: "configure",
      arguments: { action: "describe", path: "/app" },
    })
    const text = JSON.stringify(result)
    expect(text).toContain("playwright")
    expect(text).toContain("playwright-runs")
  })
  await step("잘못된 화면 크기는 앱 실행 전에 거부한다", async () => {
    const response = await http("/api/worktrees/invalid/playwright/run", "POST", {
      viewport: { width: 10, height: 840 },
    })
    expect(response.status).toBe(400)
  })
  await step("존재하지 않는 캡처를 성공 증거로 표시하지 않는다", async () => {
    expect((await http("/api/playwright-runs/missing")).status).toBe(404)
    expect(
      (await http("/api/playwright-runs/missing/source?path=application.spec.ts")).status,
    ).toBe(404)
  })
})
