import { expect, test } from "@playwright/test"
import { openExecutionReviewViewer } from "../execution-review"

test("연결된 뷰어의 승인 대기 상세를 촬영한다", async ({ page }, info) => {
  const review = await openExecutionReviewViewer(page)
  try {
    await expect(
      page.getByRole("region", { name: "Requested execution", exact: true }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Approve execution", exact: true })).toBeEnabled()
    await page.evaluate(() => document.fonts.ready)
    await info.attach("실행 검토 / Unit / 승인 대기", {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  } finally {
    await review.restore()
  }
})
