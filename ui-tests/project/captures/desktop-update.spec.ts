import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/projects", {
    data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
  })
  expect(response.ok(), "실제 앱 프로젝트를 연결한다").toBeTruthy()
})

// native IPC fixture로 새 버전 표시를 재현하며 실제 서명된 릴리스 배포를 주장하지 않는다.
for (const theme of ["light", "dark"] as const) {
  test(`사이드바 아이콘 바로가기를 ${theme} 테마로 촬영한다`, async ({ page }, testInfo) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("redpact:theme", theme)
      Object.assign(window, {
        __TAURI__: { core: { invoke: async () => ({ version: "0.2.0", busy: false }) } },
      })
    }, theme)
    await openApp(page, "en")
    await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.locator('[data-slot="sheet-overlay"]').click({
        position: { x: (page.viewportSize()?.width ?? 414) - 8, y: 100 },
      })
    }
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await expect(page.getByRole("button", { name: "Update to 0.2.0" })).toBeInViewport()
    await expect(page.getByRole("button", { name: "Update to 0.2.0" })).toHaveText("Update")
    await page.evaluate(() => document.fonts.ready)
    await testInfo.attach(`업데이트 / 사이드바 / ${theme}`, {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.locator('[data-slot="sheet-overlay"]').click({
        position: { x: (page.viewportSize()?.width ?? 414) - 8, y: 100 },
      })
    }
    await expect(page.getByRole("button", { name: "Check for updates", exact: true })).toBeVisible()
    await testInfo.attach(`업데이트 / 설정 / ${theme}`, {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  })
}

test("npm 업데이트 설치 확인창을 촬영한다", async ({ page }, testInfo) => {
  await page.route("**/api/updates", (route) =>
    route.fulfill({
      json: {
        currentVersion: "0.2.0",
        version: "0.3.0",
        busy: false,
        supported: true,
        canInstall: true,
      },
    }),
  )
  await openApp(page, "en")
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await test.step("사용자의 설치 확인 전 상태를 준비한다", async () => {
    await page.getByRole("button", { name: "Update to 0.3.0", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "Install and restart", exact: true }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await testInfo.attach("업데이트 / npm / 설치 확인", {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  })
})
