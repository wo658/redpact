import { expect, test } from "@playwright/test"
import { openApp } from "../app"

test("사이드바의 작업공간 행에서 닫고 헤더 아래에서 다시 연다", async ({ page, request }) => {
  expect(
    (await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })).ok(),
  ).toBeTruthy()
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
  const toggle = sidebarHeader.getByRole("button", { name: "Toggle Sidebar", exact: true })
  await test.step("프로젝트 표시 옵션 바로 왼쪽에 토글을 배치한다", async () => {
    await expect(toggle).toBeVisible()
    const options = sidebarHeader.getByRole("button", { name: "Project menu options", exact: true })
    const left = await toggle.boundingBox()
    const right = await options.boundingBox()
    expect(left && right && left.x + left.width <= right.x).toBeTruthy()
    await expect(page.locator('.app-header [data-slot="sidebar-trigger"]')).toHaveCount(0)
  })
  await test.step("닫은 뒤에도 다시 열어 탐색할 수 있다", async () => {
    await toggle.click()
    await expect(sidebarHeader).not.toBeInViewport()
    const reopen = page.getByRole("button", { name: "Toggle Sidebar", exact: true })
    await expect(reopen).toBeVisible()
    await reopen.click()
    await expect(sidebarHeader).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Worktrees", exact: true })).toBeVisible()
  })
})

test("Worktrees 전체 영역에서 표시 옵션을 드러내고 메뉴를 유지한다", async ({ page, request }) => {
  expect(
    (await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })).ok(),
  ).toBeTruthy()
  await openApp(page, "en")
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  const options = page.getByRole("button", { name: "Worktree display options", exact: true })
  const section = page.locator('[data-slot="sidebar-group"]').filter({ has: options })
  await expect(options).toBeEnabled()
  await page.getByRole("button", { name: "Project menu options", exact: true }).hover()
  await expect(options).toHaveCSS("opacity", "0")
  const bounds = await section.boundingBox()
  if (!bounds) {
    throw new Error("Worktrees 영역의 크기를 읽을 수 없다")
  }
  expect(bounds.height, "목록 아래 빈 공간까지 Worktrees 영역에 포함한다").toBeGreaterThan(300)
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
