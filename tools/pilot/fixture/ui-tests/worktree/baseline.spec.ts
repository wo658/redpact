import { expect, test } from "@playwright/test"

test("실제 앱 화면에서 세 seed 주문과 수량을 표시한다", async ({ page }) => {
  await test.step("주문 목록 화면을 연다", async () => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Order Desk", exact: true })).toBeVisible()
  })
  await test.step("실제 API에서 읽은 주문 세 건을 표시한다", async () => {
    const rows = page.locator("#orders tr")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).locator("td")).toHaveText(["1", "1", "250"])
    await expect(rows.nth(1).locator("td")).toHaveText(["2", "2", "500"])
    await expect(rows.nth(2).locator("td")).toHaveText(["3", "3", "750"])
  })
})
