import { expect, test } from "@playwright/test"
import { openApp } from "../app"

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/projects", {
    data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
  })
  expect(response.ok(), "실제 앱 프로젝트를 연결한다").toBeTruthy()
})

// 실제 뷰어의 표시와 요청을 native IPC fixture로 검증하며 서명된 배포 검증과 구분한다.
test("새 버전을 발견하면 하단 Update를 표시하고 설치 요청과 상태 변화를 반영한다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const fixture = {
      version: null as string | null,
      busy: false,
      requests: 0,
      repositoryRequests: 0,
      fail: false,
    }
    Object.assign(window, {
      updateFixture: fixture,
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (fixture.fail) {
              throw new Error("Native connection unavailable")
            }
            if (command === "desktop_open_repository") {
              fixture.repositoryRequests++
            }
            if (command === "desktop_install_update") {
              fixture.requests++
              fixture.busy = true
            }
            return { version: fixture.version, busy: fixture.busy }
          },
        },
      },
    })
  })
  await openApp(page, "en")
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  const update = page.getByRole("button", { name: "Update to 0.2.0", exact: true })
  await expect(update).toHaveCount(0)
  const check = page.getByRole("button", { name: "Check for updates", exact: true })
  await test.step("아이콘 한 줄에서 GitHub와 Star를 열고 새 버전이 없어도 확인한다", async () => {
    const group = page.getByRole("group", { name: "App shortcuts" })
    const links = group.getByRole("link")
    await expect(links).toHaveCount(2)
    await links.first().click()
    await links.last().click()
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { updateFixture: { repositoryRequests: number } }).updateFixture
            .repositoryRequests,
      ),
    ).toBe(2)
    await check.click()
    await expect(check).toBeDisabled()
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { busy: boolean } }).updateFixture.busy = false
    })
  })
  await test.step("새 버전을 발견하면 같은 자리에 업데이트 표시가 나타난다", async () => {
    await page.evaluate(() => {
      const target = window as unknown as { updateFixture: { version: string | null } }
      target.updateFixture.version = "0.2.0"
    })
    await expect(update).toBeVisible({ timeout: 10000 })
    const footer = page.locator('[data-slot="sidebar-footer"]:visible')
    await expect(footer.getByRole("button").first()).toHaveAccessibleName("Settings")
    await expect(footer.getByRole("button").last()).toHaveAccessibleName("Update to 0.2.0")
    const positions = await footer
      .locator("button, a")
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top))
    expect(
      Math.max(...positions) - Math.min(...positions),
      "모든 바로가기를 한 줄에 배치한다",
    ).toBeLessThan(2)
    await expect(footer.getByRole("group")).toHaveText("")
    await expect(update).toBeInViewport()
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeInViewport()
  })
  await test.step("설치 요청은 한 번만 보내고 처리 중에는 비활성화한다", async () => {
    await update.click()
    await expect(update).toBeDisabled()
    await expect(update).toHaveAttribute("aria-busy", "true")
    expect(
      await page.evaluate(
        () => (window as unknown as { updateFixture: { requests: number } }).updateFixture.requests,
      ),
    ).toBe(2)
  })
  await test.step("취소나 보류 이후 다시 선택할 수 있다", async () => {
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { busy: boolean } }).updateFixture.busy = false
    })
    await expect(update).toBeEnabled({ timeout: 10000 })
    await expect(update).toHaveAttribute("aria-busy", "false")
  })
  await test.step("연결을 잃으면 새 버전 표시를 지우고 재연결하면 복원한다", async () => {
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { fail: boolean } }).updateFixture.fail = true
    })
    await expect(update).toHaveCount(0, { timeout: 10000 })
    await expect(check).toBeVisible()
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { fail: boolean } }).updateFixture.fail = false
    })
    await expect(update).toBeVisible({ timeout: 10000 })
  })
  await test.step("새 버전이 없다는 상태를 받으면 수동 확인 아이콘으로 돌아간다", async () => {
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { version: string | null } }).updateFixture.version =
        null
    })
    await expect(update).toHaveCount(0, { timeout: 10000 })
    await expect(check).toBeVisible()
  })
})

test("일반 웹 브라우저에는 데스크톱 Update를 표시하지 않는다", async ({ page }) => {
  await openApp(page, "en")
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await expect(page.getByRole("button", { name: /^Update to |Check for updates/ })).toHaveCount(0)
  const repository = page.getByRole("link", { name: "GitHub repository" })
  await expect(repository).toHaveAttribute("href", "https://github.com/wo658/redpact")
  await expect(repository).toHaveAttribute("target", "_blank")
  await repository.hover()
  await expect(page.getByRole("tooltip")).toContainText("GitHub repository")
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.keyboard.press("Escape")
  }
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
})
