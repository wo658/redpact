import { expect, test } from "@playwright/test"
import { isOnScreen, openApp } from "../app"

test("공용 헤더의 사이드바 버튼은 접힘 상태와 관계없이 같은 위치에 남는다", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page, "en")
  const header = page.locator(".app-header:visible")
  const toggle = header.getByRole("button", { name: "Toggle Sidebar", exact: true })
  await expect(toggle).toBeInViewport()
  await expect(
    page.locator('[data-slot="sidebar-header"] [data-slot="sidebar-trigger"]'),
  ).toHaveCount(0)
  const settings = page.getByRole("button", { name: "Settings", exact: true })
  await test.step("사이드바를 펼치고 설정으로 이동한다", async () => {
    if (!(await isOnScreen(settings))) {
      await toggle.click()
    }
    await expect(settings).toBeVisible()
    await settings.click()
    await page.keyboard.press("Escape")
    await expect(header.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    await expect(toggle).toBeInViewport()
  })
  await test.step("접고 다시 열어도 헤더의 탐색 컨트롤이 유지된다", async () => {
    if (await isOnScreen(settings)) {
      await toggle.click()
    }
    await expect(settings).not.toBeInViewport()
    await expect(toggle).toBeInViewport()
    await toggle.focus()
    await page.keyboard.press("Enter")
    await expect(settings).toBeInViewport()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    } else {
      await toggle.click()
    }
    await expect(toggle).toBeInViewport()
    await toggle.click()
    await expect(page.getByRole("navigation", { name: "Worktrees", exact: true })).toBeVisible()
  })
})

test("Worktrees 전체 영역에서 표시 옵션을 드러내고 메뉴를 유지한다", async ({ page, request }) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  expect(project.location.kind).toBe("git")
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page, "en")
  if (
    !(await isOnScreen(page.getByRole("button", { name: "Project menu options", exact: true })))
  ) {
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

test("모바일 사이드바는 명시적 닫기 버튼으로 닫고 다시 열어 탐색한다", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page, "en")
  const header = page.locator(".app-header:visible")
  const toggle = header.getByRole("button", { name: "Toggle Sidebar", exact: true })
  await toggle.click()
  const sidebar = page.getByRole("dialog", { name: "Sidebar", exact: true })
  await expect(sidebar).toBeVisible()
  await sidebar.getByRole("button", { name: "Close sidebar", exact: true }).click()
  await expect(sidebar).toBeHidden()
  await expect(toggle).toBeInViewport()
  await toggle.click()
  await sidebar.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(sidebar).toBeHidden()
  await expect(header.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
})
