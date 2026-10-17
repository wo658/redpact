import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

for (const width of [1280, 390]) {
  test(`웹 ${width}px에서 사이드바와 브라우저 방문 기록을 사용한다`, async ({ page, request }) => {
    const connected = await request.post("/api/projects", {
      data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
    })
    expect(connected.ok()).toBeTruthy()
    const project = await connected.json()
    // 다른 시나리오가 연결한 프로젝트와 무관하게 이 시나리오의 대상을 선택한다.
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await page.setViewportSize({ width, height: 900 })
    await openApp(page, "en")
    const tabs = page.getByRole("tablist", { name: "Open workspaces", exact: true })
    const toggle = page.getByRole("button", { name: "Toggle Sidebar", exact: true })
    await expect(toggle).toBeInViewport()
    await expect(page.getByRole("button", { name: "Go back", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Go forward", exact: true })).toHaveCount(0)
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
      await page.goBack()
    }
    async function forward() {
      await page.goForward()
    }
    await test.step("사이드바를 접고 펼쳐도 헤더를 사용할 수 있다", async () => {
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
      const controls = await toggle.boundingBox()
      const content = await page.locator('[data-slot="sidebar-inset"]:visible').boundingBox()
      if (!controls || !content) {
        throw new Error("탐색 컨트롤과 본문 영역이 표시되어야 한다")
      }
      expect(content.y).toBeGreaterThan(controls.y + controls.height)
    })
    await navigate("Settings")
    await navigate("Project settings")
    await test.step("브라우저 방문 기록이 메뉴 사이를 이동한다", async () => {
      await back()
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
      await forward()
      await expect(
        page.getByRole("heading", { name: "Project settings", exact: true }),
      ).toBeVisible()
      await page.goBack()
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    })
    await test.step("새 이동은 앞으로 기록을 지우고 반복 선택은 중복 기록을 만들지 않는다", async () => {
      await page.getByRole("button", { name: "New tab", exact: true }).click()
      await expect(tabs.getByRole("tab")).toHaveCount(2)
      const history = await page.evaluate(() => JSON.stringify(window.history.state))
      await forward()
      expect(await page.evaluate(() => JSON.stringify(window.history.state))).toBe(history)
      const length = await page.evaluate(() => window.history.length)
      await tabs.getByRole("tab").last().click()
      expect(await page.evaluate(() => window.history.length)).toBe(length)
      await back()
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
      await forward()
      await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true")
    })
    await test.step("닫은 목적지 탭과 새로고침한 현재 화면을 복원한다", async () => {
      await navigate("Project settings")
      await tabs
        .getByRole("button", { name: `Close ${project.name} / Project settings`, exact: true })
        .last()
        .click()
      await expect(tabs.getByRole("tab")).toHaveCount(1)
      await back()
      await expect(tabs.getByRole("tab")).toHaveCount(2)
      await expect(
        page.getByRole("heading", { name: "Project settings", exact: true }),
      ).toBeVisible()
      await page.reload()
      await expect(
        page.getByRole("heading", { name: "Project settings", exact: true }),
      ).toBeVisible()
      await expect(tabs.getByRole("tab")).toHaveCount(1)
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  })
}
