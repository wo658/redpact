import { expect, test } from "@playwright/test"
import { openApp } from "../app"

test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("프로젝트 메뉴를 숨겨도 숫자 배지 없이 설정과 복원을 유지한다", async ({ page, request }) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page, "en")
  const mobile = (page.viewportSize()?.width ?? 1920) < 768
  async function openSidebar() {
    if (mobile) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
  }
  await openSidebar()
  const header = page.locator('[data-slot="sidebar-header"]:visible')
  const options = header.getByRole("button", { name: /^Project menu options/ })
  const sidebar = page.locator('[data-slot="sidebar"]:visible')
  await test.step("메뉴 한 개와 여러 개를 숨겨도 숫자를 표시하지 않는다", async () => {
    await options.click()
    await page.getByRole("menuitemcheckbox", { name: "Tests", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(options).toHaveAccessibleName("Project menu options (1 hidden)")
    await expect(header.getByText("1", { exact: true })).toHaveCount(0)
    await expect(sidebar.getByRole("button", { name: "Tests", exact: true })).toHaveCount(0)
    await options.click()
    await page.getByRole("menuitemcheckbox", { name: "File Viewer", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(options).toHaveAccessibleName("Project menu options (2 hidden)")
    await expect(header.getByText("2", { exact: true })).toHaveCount(0)
  })
  await test.step("새로고침 후 숨김 선택을 유지하고 모두 표시로 복원한다", async () => {
    await page.reload()
    await openSidebar()
    await expect(options).toHaveAccessibleName("Project menu options (2 hidden)")
    await expect(header.getByText("2", { exact: true })).toHaveCount(0)
    await expect(sidebar.getByRole("button", { name: "Tests", exact: true })).toHaveCount(0)
    await expect(sidebar.getByRole("button", { name: "File Viewer", exact: true })).toHaveCount(0)
    await options.click()
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Tests", exact: true }),
    ).toHaveAttribute("aria-checked", "false")
    await expect(
      page.getByRole("menuitemcheckbox", { name: "File Viewer", exact: true }),
    ).toHaveAttribute("aria-checked", "false")
    await page.getByRole("menuitem", { name: "Show all", exact: true }).click()
    await expect(options).toHaveAccessibleName("Project menu options")
    await expect(sidebar.getByRole("button", { name: "Tests", exact: true })).toBeVisible()
    await expect(sidebar.getByRole("button", { name: "File Viewer", exact: true })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Worktrees", exact: true })).toBeVisible()
  })
})
