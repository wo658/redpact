import type { Expect, Page } from "@playwright/test"

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
  const content = page.locator('input[name="playwright.service"]')
  await expect(content).toHaveValue("app")
  const tabs = page.getByRole("tablist", { name: "Open workspaces", exact: true })
  await expect(tabs).toBeVisible()
  await expect(page.getByRole("button", { name: "Problems (0)", exact: true })).toBeVisible()
  const original = await tabs.getByRole("tab").first().getAttribute("aria-label")
  if (!original) {
    throw new Error("열린 프로젝트 탭의 접근 가능한 이름이 필요합니다")
  }
  // 실제 앱의 유지된 탭을 재활성화하여 새로고침 요청만 실패시킨다.
  const newTabLoaded = page.waitForResponse(
    (response) => /\/api\/projects\/[^/]+\/worktrees$/.test(response.url()) && response.ok(),
  )
  await page.getByRole("button", { name: "New tab", exact: true }).click()
  await newTabLoaded
  await expect(tabs.getByRole("tab")).toHaveCount(2)
  fail = true
  await tabs.getByRole("tab", { name: original, exact: true }).first().click()
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
      // 새 요청이 성공하는지 실제 탭 탐색으로 확인한다.
      await tabs.getByRole("tab").last().click()
      await tabs.getByRole("tab").first().click()
      await expect(page.getByRole("button", { name: "Problems (0)", exact: true })).toBeVisible()
    },
  }
}
