import { expect, test } from "@playwright/test"
import { openApp } from "../app"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("redpact:tools-open", "true"))
})

for (const platform of [undefined, "macos", "windows"] as const) {
  for (const width of [1280, 390]) {
    test(`${platform ?? "웹"} ${width}px에서 검토 화면의 방문 기록과 사이드바를 유지한다`, async ({
      page,
      request,
    }) => {
      const response = await request.post("/api/projects", {
        data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
      })
      expect(response.ok()).toBeTruthy()
      const project = await response.json()
      await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
      await page.setViewportSize({ width, height: 900 })
      if (platform) {
        await page.addInitScript((platform) => {
          document.addEventListener(
            "DOMContentLoaded",
            () => {
              document.documentElement.dataset.desktop = platform
            },
            { once: true },
          )
        }, platform)
      }
      await openApp(page, "en")
      const toggle = page.getByRole("button", { name: "Toggle Sidebar", exact: true })
      await expect(toggle).toBeInViewport()
      await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toHaveCount(
        0,
      )
      if (platform === "windows") {
        await expect(page.locator(".native-window-controls").getByRole("button")).toHaveCount(3)
        await expect(
          page.getByRole("button", { name: "Close window", exact: true }),
        ).toBeInViewport()
      }
      async function navigate(name: string) {
        const button = page.getByRole("button", { name, exact: true })
        if (!(await button.isVisible())) {
          await toggle.click()
        }
        await button.click()
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
        await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden()
      }
      async function back() {
        if (platform) {
          await page.getByRole("button", { name: "Go back", exact: true }).click()
        } else {
          await page.goBack()
        }
      }
      async function forward() {
        if (platform) {
          await page.getByRole("button", { name: "Go forward", exact: true }).click()
        } else {
          await page.goForward()
        }
      }
      await test.step("사이드바를 접고 다시 펼쳐도 탐색 버튼을 유지한다", async () => {
        if (width >= 768) {
          await toggle.click()
          await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
            "data-state",
            "collapsed",
          )
          await expect(toggle).toBeInViewport()
          await toggle.click()
          await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
            "data-state",
            "expanded",
          )
        }
        if (platform) {
          const bounds = await toggle.boundingBox()
          expect(bounds?.x).toBeGreaterThanOrEqual(platform === "macos" ? 88 : 8)
          expect((bounds?.y ?? 100) + (bounds?.height ?? 0)).toBeLessThanOrEqual(48)
        }
      })
      await navigate("Settings")
      await navigate("Project settings")
      await test.step("브라우저와 네이티브 버튼이 같은 페이지 기록을 이동한다", async () => {
        await back()
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
        await forward()
        await expect(
          page.getByRole("heading", { name: "Project settings", exact: true }),
        ).toBeVisible()
        await back()
        await navigate("Execution history")
        const location = page.url()
        await forward()
        expect(page.url()).toBe(location)
        const length = await page.evaluate(() => history.length)
        await navigate("Execution history")
        expect(await page.evaluate(() => history.length)).toBe(length)
      })
      await test.step("새로고침 후에도 현재 검토 목적지를 유지한다", async () => {
        await page.reload()
        await expect(
          page.getByRole("heading", { name: "Execution history", exact: true }),
        ).toBeVisible()
        await expect(
          page.getByRole("tablist", { name: "Open workspaces", exact: true }),
        ).toHaveCount(0)
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
  }
}
