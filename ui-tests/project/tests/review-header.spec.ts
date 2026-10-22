import { expect, test } from "@playwright/test"
import { isOnScreen, openApp } from "../app"
import { cleanupHeaderFixture, createHeaderFixture } from "../header-fixture"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("공용 헤더의 리뷰 탭과 액션은 좁은 화면에서 읽기 크기와 접근성을 유지한다", async ({
  page,
}) => {
  const project = await createHeaderFixture()
  try {
    expect(project, "리뷰할 프로젝트가 있어야 한다").toBeTruthy()
    await page.addInitScript((id) => {
      localStorage.setItem("redpact:language", "en")
      localStorage.setItem("redpact:project", id)
    }, project.id)
    await page.goto("/")
    const header = page.locator(".app-header:visible")
    const toggle = header.getByRole("button", { name: "Toggle Sidebar", exact: true })
    await expect(toggle).toBeVisible()
    const navigation = page.getByRole("navigation", { name: "Worktrees", exact: true })
    if (!(await isOnScreen(navigation))) {
      await toggle.click()
    }
    const worktree = navigation.getByRole("button").first()
    await expect(worktree).toBeVisible()
    await worktree.click()
    await page.keyboard.press("Escape")
    await expect(header.getByRole("tab", { name: "Log", exact: true })).toBeVisible()
    await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toHaveCount(0)
    await expect(header.getByRole("button", { name: "Merge", exact: true })).toHaveCount(0)
    await expect(header.getByRole("button", { name: "Uncommitted", exact: true })).toHaveCount(0)
    await expect(
      header.getByRole("button", { name: /Pull request|Publish PR|Clean up worktree/ }),
    ).toHaveCount(0)
    await expect(
      header.getByRole("combobox", { name: "Execution scope", exact: true }),
    ).toHaveCount(0)
    const toolbar = header.locator('[data-slot="review-toolbar"]')
    for (const width of [1440, 850, 390]) {
      await test.step(`${width}px에서 탭 전환과 Mobile 토글을 확인한다`, async () => {
        await page.setViewportSize({ width, height: 900 })
        if (width < 768) {
          await expect(
            page.getByRole("button", { name: "Toggle Sidebar", exact: true }),
          ).toBeVisible()
        }
        await page.getByRole("tab", { name: "Log", exact: true }).click()
        const before = await toolbar.boundingBox()
        const fontSize = await page
          .getByRole("tab", { name: "Log", exact: true })
          .evaluate((element) => getComputedStyle(element).fontSize)
        await page.getByRole("tab", { name: "Playwright", exact: true }).click()
        const mobile = page.getByRole("switch", { name: "Mobile", exact: true })
        await expect(mobile).toBeVisible()
        await expect(header.getByRole("switch", { name: "Mobile", exact: true })).toHaveCount(0)
        const after = await toolbar.boundingBox()
        if (!before || !after) {
          throw new Error("헤더가 표시되어야 한다")
        }
        const navigation = await toolbar.locator('[data-slot="toolbar-navigation"]').boundingBox()
        const actions = await toolbar.locator('[data-slot="toolbar-actions"]').boundingBox()
        if (!navigation || !actions) {
          throw new Error("탐색과 액션이 표시되어야 한다")
        }
        expect(after.height, "모든 화면 크기에서 공용 헤더는 한 줄을 유지한다").toBeLessThanOrEqual(
          54,
        )
        expect(
          Math.abs(after.height - before.height),
          "추가 액션으로 헤더 높이가 달라지지 않는다",
        ).toBeLessThanOrEqual(1)
        expect(actions.x, "액션은 탐색 탭 오른쪽에 놓인다").toBeGreaterThan(navigation.x)
        expect(Math.abs(actions.y - navigation.y)).toBeLessThanOrEqual(4)
        expect(
          await page
            .getByRole("tab", { name: "Log", exact: true })
            .evaluate((element) => getComputedStyle(element).fontSize),
        ).toBe(fontSize)
        const checked = await mobile.getAttribute("aria-checked")
        await mobile.click()
        await expect(mobile).toHaveAttribute("aria-checked", checked === "true" ? "false" : "true")
        const run = page.getByRole("button", { name: "Run Playwright", exact: true })
        await run.scrollIntoViewIfNeeded()
        await expect(run).toBeInViewport()
        expect(await run.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap")
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
      })
    }
  } finally {
    await cleanupHeaderFixture(project.settingsSource)
  }
})

test("공용 헤더의 Unit·Integration·Environment는 실제 소스와 중지된 환경을 탐색한다", async ({
  page,
}) => {
  const project = await createHeaderFixture({ allTabs: true })
  try {
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    const header = page.locator(".app-header:visible")
    const navigation = page.getByRole("navigation", { name: "Worktrees", exact: true })
    if (!(await isOnScreen(navigation))) {
      await header.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await navigation.getByRole("button").first().click()
    await page.keyboard.press("Escape")
    for (const width of [1440, 800, 390]) {
      await test.step(`${width}px에서 소스와 환경을 실행 없이 탐색한다`, async () => {
        await page.setViewportSize({ width, height: 900 })
        for (const [name, marker, action] of [
          ["Unit Test", "unit-header-source", "Run Unit command"],
          ["Integration Test", "integration-header-source", "Run Integration tests"],
        ]) {
          const tab = header.getByRole("tab", { name, exact: true })
          await tab.scrollIntoViewIfNeeded()
          await tab.click()
          const panel = page.getByRole("tabpanel", { name, exact: true })
          await expect(panel).toBeVisible()
          await panel
            .getByRole("treeitem", { name: "shared-header-fixture.test.ts", exact: true })
            .click()
          await expect(panel.locator(".diff")).toContainText(marker)
          const run = header.getByRole("button", { name: action, exact: true })
          await run.scrollIntoViewIfNeeded()
          await expect(run).toBeInViewport()
          await expect(
            header.getByRole("combobox", { name: "Execution scope", exact: true }),
          ).toHaveCount(0)
          await expect(
            header.getByRole("button", {
              name: /Merge|Uncommitted|Pull request|Clean up worktree/,
            }),
          ).toHaveCount(0)
        }
        const environment = header.getByRole("tab", { name: "Environment", exact: true })
        await environment.scrollIntoViewIfNeeded()
        await environment.click()
        const panel = page.getByRole("tabpanel", { name: "Environment", exact: true })
        await expect(panel.getByText("No active environments.", { exact: true })).toBeVisible()
        const stopped = panel.getByRole("button", { name: "Stopped environments (1)", exact: true })
        if ((await stopped.getAttribute("aria-expanded")) !== "true") {
          await stopped.click()
        }
        await expect(
          panel.getByRole("button", {
            name: `Environment details ${project.environmentId}`,
            exact: true,
          }),
        ).toBeVisible()
        await expect(panel.getByText("stopped", { exact: true })).toBeVisible()
        const toolbar = header.locator('[data-slot="review-toolbar"]')
        expect(
          (await toolbar.boundingBox())?.height,
          "공용 헤더는 모든 탭에서 한 줄을 유지한다",
        ).toBeLessThanOrEqual(54)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          "긴 탭 탐색은 페이지 전체를 가로로 늘리지 않는다",
        ).toBeLessThanOrEqual(width)
        const unit = header.getByRole("tab", { name: "Unit Test", exact: true })
        await unit.scrollIntoViewIfNeeded()
        await unit.click()
        await page.keyboard.press("ArrowRight")
        await expect(
          header.getByRole("tab", { name: "Integration Test", exact: true }),
        ).toHaveAttribute("aria-selected", "true")
      })
    }
  } finally {
    await cleanupHeaderFixture(project.settingsSource, project.environmentId)
  }
})
