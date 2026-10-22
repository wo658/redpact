import type { Expect, Page } from "@playwright/test"
import { node } from "./target"

export async function verifyProblems(page: Page, expect: Expect, width: number) {
  await page.setViewportSize({ width, height: 900 })
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
  if (mobile) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await page.getByRole("button", { name: "Project settings", exact: true }).click()
  if (mobile) {
    await page.keyboard.press("Escape")
  }
  const content = page.locator('input[name="playwright.service"]:visible')
  await expect(content).toHaveValue("app")
  await expect(page.locator(".app-header:visible")).toBeVisible()
  await expect(page.getByRole("button", { name: "Problems (0)", exact: true })).toBeVisible()
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
  const problems = page.getByRole("button", { name: "Problems (1)", exact: true })
  await expect(problems).toBeVisible()
  await expect(content).toHaveValue("app")
  await expect(page.getByText("Request failed (503)", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Problem details", exact: true })).toHaveCount(0)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await problems.click()
  const dialog = page.getByRole("dialog", { name: "Problems", exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("Request failed (503)", { exact: true })).toBeVisible()
  return {
    dialog,
    recover: async () => {
      fail = false
      await dialog.getByRole("button", { name: "Clear problems", exact: true }).click()
      await expect(dialog.getByText("No problems recorded.")).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(problems).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Problems (0)", exact: true })).toBeFocused()
      // 실제 파일 관찰로 성공한 새로고침을 다시 확인한다.
      const refreshed = page.waitForResponse(
        (response) => /\/api\/projects\/[^/]+\/worktrees$/.test(response.url()) && response.ok(),
      )
      await node(
        `import {rmSync} from 'node:fs'; rmSync('/app/problems-refresh.txt',{force:true}); console.log('null');`,
      )
      await refreshed
      await expect(page.getByRole("button", { name: "Problems (0)", exact: true })).toBeVisible()
    },
  }
}
