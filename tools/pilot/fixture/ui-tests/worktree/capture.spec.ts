import { expect, test } from "@playwright/test"

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`기준 주문 화면 ${viewport.width}×${viewport.height}를 촬영한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Order Desk", exact: true })).toBeVisible()
    await expect(page.locator("#orders tr")).toHaveCount(3)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "페이지가 가로로 넘치지 않는다",
    ).toBe(true)
    await testInfo.attach(`기준 주문 목록 ${viewport.width}×${viewport.height}`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    })
  })
}
