import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

for (const platform of [undefined, "macos", "windows"] as const) {
  const native = platform !== undefined
  for (const width of [1280, 800, 390]) {
    test(`${platform ?? "웹"} ${width}px 탐색 컨트롤 배치를 촬영한다`, async ({
      page,
      request,
    }, testInfo) => {
      const connected = await request.post("/api/projects", {
        data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
      })
      expect(connected.ok()).toBeTruthy()
      await page.setViewportSize({ width, height: 900 })
      // 네이티브 창 버튼 자체는 Chromium 캡처에 포함되지 않는다.
      if (native) {
        await page.addInitScript((platform) => {
          document.addEventListener(
            "DOMContentLoaded",
            () => {
              document.documentElement.dataset.desktop = platform
            },
            { once: true },
          )
        }, platform)
      }
      await openApp(page, "en")
      const toggle = page.getByRole("button", { name: "Toggle Sidebar", exact: true })
      await expect(toggle).toBeVisible()
      if (width < 768) {
        await toggle.click()
      }
      await page.getByRole("button", { name: "Settings", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
      await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden()
      await page.evaluate(() => document.fonts.ready)
      for (const state of ["기본", "사이드바 전환", "다크 테마"] as const) {
        if (state === "다크 테마") {
          await page.emulateMedia({ colorScheme: "dark" })
          await expect(page.locator("html")).toHaveClass(/dark/)
        }
        if (state === "사이드바 전환") {
          await toggle.click()
          if (width < 768) {
            await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeVisible()
            await expect(
              page.getByRole("button", { name: "Project settings", exact: true }),
            ).toBeInViewport()
          } else {
            await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
              "data-state",
              "collapsed",
            )
          }
        }
        await testInfo.attach(`${platform ?? "웹"} / ${width}px / ${state}`, {
          body: await page.screenshot({ animations: "disabled" }),
          contentType: "image/png",
        })
      }
    })
  }
}
