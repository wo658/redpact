import { expect, test } from "@playwright/test"
import { openApp } from "../app"

for (const width of [1280, 390]) {
  test(`${width}px 앱 홈은 프로젝트·환경·설정을 유지하고 실행 링크는 별도로 검토한다`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const response = await request.post("/api/projects", {
      data: { path: "/app", name: "Redpact" },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    await test.step("채팅 실행 문맥 없이도 전체 앱 탐색을 제공한다", async () => {
      if (width < 768) {
        await page
          .locator("#root")
          .getByRole("button", { name: "Toggle Sidebar", exact: true })
          .click()
      }
      await expect(page.getByRole("button", { name: project.name, exact: true })).toBeVisible()
      for (const name of ["Container", "Tests", "Dependencies", "Project settings", "Settings"]) {
        await expect(page.getByRole("button", { name, exact: true })).toBeVisible()
      }
      await expect(page.getByRole("heading", { name: "Open an execution from chat" })).toHaveCount(
        0,
      )
    })
    await test.step("환경 관리에서 설정으로 이동해도 앱 탐색을 유지한다", async () => {
      await page.getByRole("button", { name: "Container", exact: true }).click()
      if (width < 768) {
        await page.keyboard.press("Escape")
      }
      await expect(page.getByRole("region", { name: "Container", exact: true })).toBeVisible()
      for (const name of ["Project settings", "Settings"]) {
        if (width < 768) {
          await page
            .locator("#root")
            .getByRole("button", { name: "Toggle Sidebar", exact: true })
            .click()
        }
        await page.getByRole("button", { name, exact: true }).click()
        if (width < 768) {
          await page.keyboard.press("Escape")
        }
        await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
    await test.step("잘못된 실행 링크는 전체 앱으로 돌아갈 경로와 진단을 표시한다", async () => {
      await page.goto("/?page=review&kind=unknown&id=wrong")
      await expect(page.getByRole("alert")).toContainText("Invalid execution link.")
      await expect(page.getByRole("link", { name: "Back to app", exact: true })).toBeVisible()
      await page.getByRole("link", { name: "Back to app", exact: true }).click()
      if (width < 768) {
        await page
          .locator("#root")
          .getByRole("button", { name: "Toggle Sidebar", exact: true })
          .click()
      }
      await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible()
    })
  })
}
