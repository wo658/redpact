import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

for (const native of [false, true]) {
  for (const width of [1280, 390]) {
    test(`${native ? "macOS 창 영역" : "웹"} ${width}px 탐색 컨트롤 배치를 촬영한다`, async ({
      page,
      request,
    }, testInfo) => {
      const connected = await request.post("/api/projects", {
        data: { path: "/app", name: "Redpact" },
      })
      expect(connected.ok()).toBeTruthy()
      await page.setViewportSize({ width, height: 900 })
      // 네이티브 창 버튼 자체는 Chromium 캡처에 포함되지 않는다.
      if (native) {
        await page.addInitScript(() => {
          document.addEventListener(
            "DOMContentLoaded",
            () => {
              document.documentElement.dataset.desktop = "macos"
            },
            { once: true },
          )
        })
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
      for (const state of ["기본", "사이드바 전환"] as const) {
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
        await testInfo.attach(`${native ? "macOS" : "웹"} / ${width}px / ${state}`, {
          body: await page.screenshot({ animations: "disabled" }),
          contentType: "image/png",
        })
      }
    })
  }
}
