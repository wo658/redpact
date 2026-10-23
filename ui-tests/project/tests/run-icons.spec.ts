import { expect, test } from "@playwright/test"
import { isOnScreen, openApp } from "../app"
import { cleanupHeaderFixture, createHeaderFixture } from "../header-fixture"

test("공통 실행 아이콘은 좁은 헤더에서 이름과 상태를 유지하고 실행 선택을 연다", async ({
  page,
}) => {
  const project = await createHeaderFixture({ allTabs: true })
  try {
    await page.addInitScript((id) => {
      localStorage.setItem("redpact:project", id)
      localStorage.setItem("redpact:language", "en")
    }, project.id)
    await openApp(page, "en")
    const header = page.locator(".app-header:visible")
    const toggle = header.getByRole("button", { name: "Toggle Sidebar", exact: true })
    for (const width of [1920, 800, 414]) {
      await test.step(`${width}px에서 실행 아이콘과 한 줄 헤더를 확인한다`, async () => {
        await page.setViewportSize({ width, height: 900 })
        const navigation = page.getByRole("navigation", { name: "Worktrees", exact: true })
        if (!(await isOnScreen(navigation))) {
          await toggle.click()
        }
        await navigation.getByRole("button").first().click()
        await page.keyboard.press("Escape")
        for (const [tabName, action] of [
          ["Unit", "Run Unit command"],
          ["Integration", "Run Integration tests"],
          ["Playwright", "Run Playwright"],
        ]) {
          const tab = header.getByRole("tab", { name: tabName, exact: true })
          await tab.scrollIntoViewIfNeeded()
          await tab.click()
          const run = header.getByRole("button", { name: action, exact: true })
          await expect(run).toBeVisible()
          await expect(run).toHaveText("")
          await expect(run.locator("svg.lucide-play")).toBeVisible()
          await expect(async () => {
            const bounds = await run.boundingBox()
            expect(bounds?.width).toBe(28)
            expect(bounds?.height).toBe(28)
            const headerBounds = await header.boundingBox()
            expect(headerBounds?.height).toBeLessThanOrEqual(54)
            if (!bounds || !headerBounds) {
              throw new Error("헤더와 실행 버튼의 화면 위치를 확인할 수 없습니다")
            }
            const rightInset = headerBounds.x + headerBounds.width - bounds.x - bounds.width
            expect(rightInset).toBeGreaterThanOrEqual(0)
            expect(rightInset).toBeLessThanOrEqual(9)
          }).toPass({ timeout: 5000 })
          await expect(header.getByRole("button", { name: /^Problems \(/ })).toHaveCount(0)
        }
      })
    }
    if (!(await isOnScreen(page.getByRole("button", { name: "Tests", exact: true })))) {
      await toggle.click()
    }
    await page.getByRole("button", { name: "Tests", exact: true }).click()
    await page.keyboard.press("Escape")
    await header.getByRole("tab", { name: "Playwright", exact: true }).click()
    await header.getByRole("button", { name: "Run Playwright", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "Run Playwright", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Run Playwright", exact: true })).toBeVisible()
    await expect(
      page
        .getByRole("dialog", { name: "Run Playwright", exact: true })
        .getByRole("button", { name: "Run Playwright", exact: true }),
    ).toHaveText("Run Playwright")
  } finally {
    await cleanupHeaderFixture(project.settingsSource, project.environmentId, project.captureId)
  }
})
