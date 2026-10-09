import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test.beforeEach(async ({ page, request }) => {
  const response = await request.post("/api/projects", {
    data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  expect(project.location.kind, "표시 옵션은 실제 Git 프로젝트에서 검증한다").toBe("git")
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:tools-open", "true")
  }, project.id)
})

test("macOS 신호등 옆에서 사이드바를 닫고 다시 연다", async ({ page }) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        document.documentElement.dataset.desktop = "macos"
        observer.disconnect()
      }
    })
    observer.observe(document, { childList: true, subtree: true })
  })
  await openApp(page, "en")
  const mobile = (page.viewportSize()?.width ?? 1920) < 768
  if (mobile) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  const sidebarHeader = page.locator('[data-slot="sidebar-header"]:visible')
  const toggle = (mobile ? sidebarHeader : page.locator(".native-sidebar-toolbar")).getByRole(
    "button",
    { name: "Toggle Sidebar", exact: true },
  )
  await test.step("탐색 버튼은 네이티브 헤더나 모바일 사이드바에서 접근할 수 있다", async () => {
    await expect(toggle).toBeVisible()
    if (!mobile) {
      const bounds = await toggle.boundingBox()
      expect(bounds?.x).toBeGreaterThanOrEqual(88)
      expect((bounds?.y ?? 100) + (bounds?.height ?? 0)).toBeLessThanOrEqual(48)
      await expect(page.getByRole("button", { name: "Go forward", exact: true })).toBeVisible()
    }
    await expect(page.getByRole("tablist", { name: "Open workspaces" })).toHaveCount(0)
  })
  await test.step("닫은 뒤에도 다시 열어 탐색할 수 있다", async () => {
    await toggle.click()
    await expect(sidebarHeader).not.toBeInViewport()
    const reopen = page.getByRole("button", { name: "Toggle Sidebar", exact: true })
    await expect(reopen).toBeVisible()
    if (!mobile) {
      const bounds = await reopen.boundingBox()
      expect(bounds?.x).toBe(88)
      expect((bounds?.y ?? 100) + (bounds?.height ?? 0)).toBeLessThanOrEqual(48)
    }
    await reopen.click()
    await expect(sidebarHeader).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Worktrees", exact: true })).toBeVisible()
  })
})

test("Worktrees 전체 영역에서 표시 옵션을 드러내고 메뉴를 유지한다", async ({ page }) => {
  await openApp(page, "en")
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  const options = page.getByRole("button", { name: "Worktree display options", exact: true })
  const section = page.locator('[data-slot="sidebar-group"]').filter({ has: options })
  await expect(options).toBeEnabled()
  await page.getByRole("button", { name: "Current work", exact: true }).hover()
  await expect(options).toHaveCSS("opacity", "0")
  const bounds = await section.boundingBox()
  if (!bounds) {
    throw new Error("Worktrees 영역의 크기를 읽을 수 없다")
  }
  expect(bounds.height, "목록 아래 빈 공간까지 Worktrees 영역에 포함한다").toBeGreaterThan(100)
  await section.hover({ position: { x: 12, y: bounds.height - 12 } })
  await expect(options).toHaveCSS("opacity", "1")
  await options.click()
  const choice = page.getByRole("menuitemradio", { name: "Include local branches", exact: true })
  await choice.hover()
  await expect(options).toHaveCSS("opacity", "1")
  await choice.click()
  await section.hover()
  await options.click()
  await expect(
    page.getByRole("menuitemradio", { name: "Include local branches", exact: true }),
  ).toHaveAttribute("aria-checked", "true")
  await page.keyboard.press("Escape")
  await page.mouse.move(500, 0)
  await options.focus()
  await expect(options).toHaveCSS("opacity", "1")
})
