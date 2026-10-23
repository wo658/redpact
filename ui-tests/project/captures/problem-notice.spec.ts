import { expect, test } from "@playwright/test"
import { isOnScreen } from "../app"

test("설정 검증 오류의 알림과 Settings 상세 진단을 각각 기록한다", async ({
  page,
  request,
}, info) => {
  const response = await request.post("/api/projects", {
    data: { path: "/app", name: "Problem notice capture fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id: string) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.id)
  await page.goto("/")
  const mobile = (page.viewportSize()?.width ?? 1920) < 768
  if (!(await isOnScreen(page.getByRole("button", { name: "Project settings", exact: true })))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await page.getByRole("button", { name: "Project settings", exact: true }).click()
  if (mobile) {
    await page.keyboard.press("Escape")
  }
  const service = page.locator('input[name="playwright.service"]')
  await expect(service).toHaveValue("app")
  await service.fill("")
  await page.getByRole("button", { name: "Save settings", exact: true }).click()
  await expect(page.locator('main [role="alert"]')).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Problem details", exact: true })).toHaveCount(0)
  const notice = page.locator('[data-slot="toast"]').filter({ hasText: "Problem recorded" })
  await expect(notice).toBeVisible()
  await expect(
    page.locator(".app-header").getByRole("button", { name: /^Problems \(/ }),
  ).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await info.attach("문제 상황 / 본문 유지 / 우하단 알림", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
  await notice.getByText("Problem recorded", { exact: true }).click()
  await expect(notice).toHaveCount(0)
  const settings = page.getByRole("button", { name: "Settings", exact: true })
  if (!(await isOnScreen(settings))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await settings.click()
  if (mobile) {
    await page.keyboard.press("Escape")
  }
  const problems = page.getByRole("region", { name: "Problems (1)", exact: true })
  await expect(problems.locator("li")).toContainText(/playwright/i)
  await expect(page.locator('[data-slot="dialog-content"]:visible')).toHaveCount(0)
  await info.attach("전역 Settings / 알림을 닫은 뒤 보존된 상세 진단", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
})
