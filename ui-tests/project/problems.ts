import type { Expect, Page } from "@playwright/test"
import { isOnScreen } from "./app"
import { node } from "./target"

export async function verifyProblems(page: Page, expect: Expect, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => localStorage.setItem("redpact:language", "en"))
  let fail = false
  await page.route("**/api/projects/*/worktrees", (route) =>
    fail ? route.fulfill({ status: 503, body: "Temporarily unavailable" }) : route.continue(),
  )
  const loaded = page.waitForResponse(
    (response) => /\/api\/projects\/[^/]+\/worktrees$/.test(response.url()) && response.ok(),
  )
  await page.goto("/")
  await loaded
  const mobile = width < 768
  if (!(await isOnScreen(page.getByRole("button", { name: "Project settings", exact: true })))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await page.getByRole("button", { name: "Project settings", exact: true }).click()
  if (mobile) {
    await page.keyboard.press("Escape")
  }
  const content = page.locator('input[name="playwright.service"]:visible')
  await expect(content).toHaveValue("app")
  await expect(page.locator(".app-header:visible")).toBeVisible()
  await expect(
    page.locator(".app-header").getByRole("button", { name: /^Problems \(/ }),
  ).toHaveCount(0)
  fail = true
  // 실제 파일 관찰로 백그라운드 새로고침만 실패시킨다.
  const failed = page.waitForResponse(
    (response) =>
      /\/api\/projects\/[^/]+\/worktrees$/.test(response.url()) && response.status() === 503,
  )
  await node(
    `import {writeFileSync} from 'node:fs'; writeFileSync('/app/problems-refresh.txt',String(Date.now())); console.log('null');`,
  )
  await failed
  const notice = page.locator('[data-slot="toast"]').filter({ hasText: "Problem recorded" })
  await expect(notice).toBeVisible()
  await expect(notice.getByText("See Settings for details.", { exact: true })).toBeVisible()
  await expect(content).toHaveValue("app")
  await expect(
    page.locator(".app-header").getByRole("button", { name: /^Problems \(/ }),
  ).toHaveCount(0)
  await expect(page.getByText("Request failed (503)", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Problem details", exact: true })).toHaveCount(0)
  await expect(page.locator('[data-slot="dialog-content"]:visible')).toHaveCount(0)
  const settings = page.getByRole("region", { name: "Problems (1)", exact: true })
  const openSettings = async () => {
    if (await notice.isVisible()) {
      await notice.getByText("Problem recorded", { exact: true }).click()
      await expect(notice).toHaveCount(0)
    }
    if (!(await isOnScreen(page.getByRole("button", { name: "Settings", exact: true })))) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    if (mobile) {
      await page.keyboard.press("Escape")
    }
    await expect(settings).toBeVisible()
    await expect(settings.getByText("Request failed (503)", { exact: true })).toBeVisible()
    await expect(notice).toHaveCount(0)
    await expect(page.locator('[data-slot="dialog-content"]:visible')).toHaveCount(0)
  }
  return {
    notice,
    settings,
    openSettings,
    recover: async () => {
      fail = false
      if (!(await settings.isVisible())) {
        await openSettings()
      }
      await settings.getByRole("button", { name: "Clear problems", exact: true }).click()
      await expect(page.getByRole("region", { name: "Problems (0)", exact: true })).toBeVisible()
      await expect(page.getByText("No problems recorded.", { exact: true })).toBeVisible()
      // 실제 파일 관찰로 성공한 새로고침을 다시 확인한다.
      const refreshed = page.waitForResponse(
        (response) => /\/api\/projects\/[^/]+\/worktrees$/.test(response.url()) && response.ok(),
      )
      await node(
        `import {rmSync} from 'node:fs'; rmSync('/app/problems-refresh.txt',{force:true}); console.log('null');`,
      )
      await refreshed
      await expect(page.getByRole("heading", { name: "Problems (0)", exact: true })).toBeVisible()
      await expect(
        page.locator(".app-header").getByRole("button", { name: /^Problems \(/ }),
      ).toHaveCount(0)
    },
  }
}
