import { expect, test } from "@playwright/test"
import { openExecutionReview, openExecutionReviewViewer } from "../execution-review"

test("채팅 승인 카드의 명령과 입력 식별자를 검토한다", async ({ page }, info) => {
  const review = await openExecutionReview(page)
  try {
    await review.card.getByText("Inputs", { exact: true }).click()
    await page.evaluate(() => document.fonts.ready)
    await info.attach("MCP Apps / Unit / 승인 대기", {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  } finally {
    await review.restore()
  }
})

for (const width of [1280, 390]) {
  test(`${width}px 연결된 뷰어의 승인 대기 상세를 촬영한다`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const review = await openExecutionReviewViewer(page)
    try {
      await expect(
        page.getByRole("region", { name: "Requested execution", exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Approve execution", exact: true }),
      ).toBeEnabled()
      await page.evaluate(() => document.fonts.ready)
      await info.attach(`${width}px / 실행 검토 / 승인 대기`, {
        body: await page.screenshot({ animations: "disabled", scale: "css" }),
        contentType: "image/png",
      })
    } finally {
      await review.restore()
    }
  })
}
