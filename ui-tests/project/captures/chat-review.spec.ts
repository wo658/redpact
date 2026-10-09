import { expect, test } from "@playwright/test"
import { openApp } from "../app"

for (const width of [1280, 390]) {
  test(`${width}px 실행 링크 안내와 잘못된 링크의 진단을 촬영한다`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await openApp(page, "en")
    await expect(page.getByRole("heading", { name: "Open an execution from chat" })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await info.attach(`${width}px / 실행 링크 안내`, {
      body: await page.screenshot(),
      contentType: "image/png",
    })
    await page.goto("/?page=review&kind=unknown&id=wrong")
    await expect(page.getByRole("alert")).toContainText("Invalid execution link.")
    await info.attach(`${width}px / 잘못된 링크`, {
      body: await page.screenshot(),
      contentType: "image/png",
    })
  })
}
