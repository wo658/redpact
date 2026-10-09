import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("redpact:tools-open", "true"))
})

test("프로젝트 통합 테스트 화면에는 실행 선택 폼이 없다", async ({ page, request }) => {
  const created = await request.post("/api/projects", {
    data: { path: "/app", name: "Fixed configuration" },
  })
  expect(created.ok()).toBeTruthy()
  const project = await created.json()
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:language", "en")
    localStorage.setItem("redpact:project", id)
  }, project.id)
  await test.step("프로젝트 테스트로 이동한다", async () => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Current work", exact: true })).toBeVisible()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
      await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeVisible()
    } else {
      await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "expanded")
    }
    const tests = page.getByRole("button", { name: "Tests", exact: true })
    await expect(tests).toBeInViewport()
    await tests.click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
    await page.getByRole("tab", { name: "Integration", exact: true }).click()
    await expect(page.getByRole("region", { name: "Integration Test", exact: true })).toBeVisible()
  })
  await test.step("고정 설정을 다시 선택하는 컨트롤이 없는지 확인한다", async () => {
    await expect(
      page.getByRole("button", { name: "Integration defaults", exact: true }),
    ).toHaveCount(0)
  })
})
