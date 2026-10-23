import { expect, test } from "@playwright/test"

test.use({
  launchOptions: {
    channel: "chromium",
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

import { openEmbeddedViewer } from "../embedded-viewer"

for (const width of [1920, 800]) {
  test(`GPT 뷰어는 ${width === 1920 ? "Full" : "Half"}에서 접혀 시작하고 수동 토글만 따른다`, async ({
    page,
    request,
  }) => {
    const response = await request.post("/api/projects", {
      data: { path: "/app", name: "Redpact" },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.setViewportSize({ width, height: 1080 })
    const viewer = await openEmbeddedViewer(page, project.id)
    const sidebar = viewer.locator('[data-slot="sidebar"][data-state]')
    const toggle = viewer
      .locator(".app-header:visible")
      .getByRole("button", { name: "Toggle Sidebar", exact: true })
    await test.step("최초 진입 시 사이드바가 접히고 본문이 전체 너비를 쓴다", async () => {
      await expect(sidebar).toHaveAttribute("data-state", "collapsed")
      await expect(toggle).toBeInViewport()
    })
    await test.step("수동으로 펼친 상태는 화면 크기를 바꿔도 유지한다", async () => {
      await toggle.click()
      await expect(sidebar).toHaveAttribute("data-state", "expanded")
      await page.setViewportSize({ width: width === 1920 ? 800 : 1920, height: 1080 })
      await expect(sidebar).toHaveAttribute("data-state", "expanded")
    })
    await test.step("접은 상태도 화면 크기를 바꿔도 유지하고 재진입하면 다시 접힌다", async () => {
      await toggle.click()
      await page.setViewportSize({ width, height: 1080 })
      await expect(sidebar).toHaveAttribute("data-state", "collapsed")
      await toggle.click()
      await expect(sidebar).toHaveAttribute("data-state", "expanded")
      await page.reload()
      await expect(sidebar).toHaveAttribute("data-state", "collapsed")
    })
  })
}
