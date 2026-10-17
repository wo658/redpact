import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("브라우저에서 사이드바를 닫고 다시 연다", async ({ page, request }) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  expect(project.location.kind).toBe("git")
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page, "en")
  const mobile = (page.viewportSize()?.width ?? 1920) < 768
  if (mobile) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  const sidebarHeader = page.locator('[data-slot="sidebar-header"]:visible')
  const toggle = sidebarHeader.getByRole("button", { name: "Toggle Sidebar", exact: true })
  await test.step("탐색 버튼은 사이드바 헤더에 두고 탭은 앱 영역에 둔다", async () => {
    await expect(toggle).toBeVisible()
    const options = sidebarHeader.getByRole("button", { name: "Project menu options", exact: true })
    const left = await toggle.boundingBox()
    const right = await options.boundingBox()
    expect(left && right && left.x + left.width <= right.x).toBeTruthy()
    if (!mobile) {
      const sidebar = await page.locator('[data-slot="sidebar-container"]').boundingBox()
      const tabs = await page.getByRole("tablist", { name: "Open workspaces" }).boundingBox()
      expect(tabs?.x).toBeGreaterThanOrEqual(sidebar?.width ?? 0)
    }
    await expect(page.locator('.app-header [data-slot="sidebar-trigger"]')).toHaveCount(0)
  })
  await test.step("닫은 뒤에도 다시 열어 탐색할 수 있다", async () => {
    await toggle.click()
    await expect(sidebarHeader).not.toBeInViewport()
    const reopen = page
      .locator(".app-header:visible")
      .getByRole("button", { name: "Toggle Sidebar", exact: true })
    await expect(reopen).toBeVisible()
    const header = page.locator(".app-header:visible")
    await expect(header.getByRole("button", { name: "Toggle Sidebar", exact: true })).toBeVisible()
    const headerBounds = await header.boundingBox()
    const contentBounds = await page.locator('[data-slot="sidebar-inset"]:visible').boundingBox()
    if (!headerBounds || !contentBounds) {
      throw new Error("작업공간 헤더와 본문 영역이 표시되어야 한다")
    }
    expect(
      contentBounds.y,
      "접힌 사이드바는 헤더 아래에 추가 행을 만들지 않는다",
    ).toBeLessThanOrEqual(headerBounds.y + headerBounds.height + 1)
    await expect(page.getByRole("button", { name: "New tab", exact: true })).toBeInViewport()
    await reopen.focus()
    await page.keyboard.press("Enter")
    await expect(sidebarHeader).toBeVisible()
    await toggle.click()
    await reopen.click()
    await expect(sidebarHeader).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Worktrees", exact: true })).toBeVisible()
  })
  await test.step("탭이 넘쳐도 다시 열기와 새 탭 버튼을 사용할 수 있다", async () => {
    const newTab = page.getByRole("button", { name: "New tab", exact: true })
    if (mobile) {
      await toggle.click()
      await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden()
    }
    for (let index = 0; index < 8; index += 1) {
      await newTab.click()
    }
    if (!mobile) {
      await sidebarHeader.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    const header = page.locator(".app-header:visible")
    await expect(header.getByRole("tab")).toHaveCount(9)
    const reopen = header.getByRole("button", { name: "Toggle Sidebar", exact: true })
    await expect(reopen).toBeInViewport()
    await expect(newTab).toBeInViewport()
    await expect(header.getByRole("tab", { selected: true })).toBeInViewport()
    await reopen.click()
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    if (mobile) {
      await expect(reopen).toBeInViewport()
      await reopen.click()
      await expect(sidebarHeader).toBeVisible()
    }
  })
})

test("Worktrees 전체 영역에서 표시 옵션을 드러내고 메뉴를 유지한다", async ({ page, request }) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  expect(project.location.kind).toBe("git")
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
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
