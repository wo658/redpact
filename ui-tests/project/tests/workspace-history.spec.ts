import { expect, test } from "@playwright/test"
import { isOnScreen, openApp } from "../app"

for (const width of [1280, 800, 390]) {
  test(`웹 ${width}px에서 공용 헤더와 브라우저 방문 기록을 사용한다`, async ({ page, request }) => {
    const connected = await request.post("/api/projects", {
      data: { path: "/app", name: "Redpact" },
    })
    expect(connected.ok()).toBeTruthy()
    const project = await connected.json()
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await page.setViewportSize({ width, height: 900 })
    await openApp(page, "en")
    const header = page.locator(".app-header:visible")
    const toggle = header.getByRole("button", { name: "Toggle Sidebar", exact: true })
    await expect(toggle).toBeInViewport()
    await expect(page.getByRole("button", { name: "Go back", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Go forward", exact: true })).toHaveCount(0)
    async function navigate(name: string) {
      const button = page.getByRole("button", { name, exact: true })
      if (!(await isOnScreen(button))) {
        await toggle.click()
      }
      await button.click()
      await page.keyboard.press("Escape")
      await expect(header.getByRole("heading", { name, exact: true })).toBeVisible()
      await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden()
    }
    await navigate("Settings")
    await navigate("Project settings")
    await test.step("브라우저 방문 기록이 메뉴 사이를 이동한다", async () => {
      await page.goBack()
      await expect(header.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
      await page.goForward()
      await expect(
        header.getByRole("heading", { name: "Project settings", exact: true }),
      ).toBeVisible()
      await page.goBack()
    })
    await test.step("새 이동은 앞으로 기록을 지우고 반복 선택은 중복 기록을 만들지 않는다", async () => {
      await navigate("File Viewer")
      const destination = await page.evaluate(() => JSON.stringify(window.history.state))
      await page.goForward()
      expect(await page.evaluate(() => JSON.stringify(window.history.state))).toBe(destination)
      const length = await page.evaluate(() => window.history.length)
      await navigate("File Viewer")
      expect(await page.evaluate(() => window.history.length)).toBe(length)
      await page.goBack()
      await expect(header.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
      await page.goForward()
      await expect(header.getByRole("heading", { name: "File Viewer", exact: true })).toBeVisible()
    })
    await test.step("새로고침한 현재 화면을 작업공간 탭 없이 복원한다", async () => {
      await page.reload()
      await expect(header.getByRole("heading", { name: "File Viewer", exact: true })).toBeVisible()
      await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toHaveCount(
        0,
      )
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  })
}
