import { expect, test } from "@playwright/test"
import { openApp } from "../app"

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
      await page.keyboard.press("Escape")
    }
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await expect(page.getByRole("button", { name: "Update to 0.2.0" })).toBeInViewport()
    await page.evaluate(() => document.fonts.ready)
    await testInfo.attach(`사이드바 / 아이콘 바로가기 / ${theme}`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    })
  })
}
