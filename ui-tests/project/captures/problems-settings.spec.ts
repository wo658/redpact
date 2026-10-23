import { expect, test } from "@playwright/test"
import { verifyProblems } from "../problems"

test("우하단 문제 알림과 전역 Settings 상세 진단을 별도로 기록한다", async ({
  page,
  request,
}, info) => {
  const width = page.viewportSize()?.width ?? 1920
  test.skip(width < 768, "이번 시각 검증은 Desktop Full View와 Half View만 기록한다")
  const response = await request.post("/api/projects", {
    data: { path: "/app", name: "Problems settings capture fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id: string) => localStorage.setItem("redpact:project", id), project.id)
  const { notice, openSettings, recover } = await verifyProblems(
    page,
    expect,
    width,
    page.viewportSize()?.height ?? 1080,
  )
  await page.evaluate(() => document.fonts.ready)
  await expect(notice).toBeVisible()
  await info.attach("문제 알림 / 본문 유지 / 우하단 토스트", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
  await openSettings()
  await info.attach("전역 Settings / 보존된 문제 상세 / 명시적 목록 비우기", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
  await recover()
})
