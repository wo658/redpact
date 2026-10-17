import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

for (const state of ["기본", "사이드바 전환", "다크 테마"] as const) {
  test(`웹 탐색 컨트롤의 ${state} 상태를 촬영한다`, async ({ page, request }, testInfo) => {
    const mobile = (page.viewportSize()?.width ?? 1920) < 768
    await test.step("실행에서 지정한 화면 크기로 설정 페이지를 연다", async () => {
      const connected = await request.post("/api/projects", {
        data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
      })
      expect(connected.ok()).toBeTruthy()
      const project = await connected.json()
      await page.addInitScript((id) => {
        localStorage.setItem("redpact:project", id)
        localStorage.setItem("redpact:theme", "system")
      }, project.id)
      await page.emulateMedia({ colorScheme: state === "다크 테마" ? "dark" : "light" })
      await openApp(page, "en")
      const toggle = page.getByRole("button", { name: "Toggle Sidebar", exact: true })
      await expect(toggle).toBeVisible()
      if (mobile) {
        await toggle.click()
      }
      await page.getByRole("button", { name: "Settings", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
      await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden()
    })
    await test.step("사이드바 상태와 테마를 확인하고 전체 화면을 촬영한다", async () => {
      if (state !== "기본") {
        await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
        if (mobile) {
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
      if (state === "다크 테마") {
        await expect(page.locator("html")).toHaveClass(/dark/)
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/)
      }
      await page.evaluate(() => document.fonts.ready)
      await testInfo.attach(`작업공간 / 탐색 / ${state}`, {
        body: await page.screenshot({ animations: "disabled", scale: "css" }),
        contentType: "image/png",
      })
    })
  })
}
