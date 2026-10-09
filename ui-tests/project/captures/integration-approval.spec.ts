import { expect, test } from "@playwright/test"
import { openIntegrationReviewViewer } from "../execution-review"

for (const width of [1280, 390]) {
  test(`${width}px Integration 승인 요청의 실행 서비스와 제출 근거를 촬영한다`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const review = await openIntegrationReviewViewer(page)
    try {
      const preview = page.getByRole("region", { name: "Requested execution", exact: true })
      await expect(
        preview.getByRole("heading", { name: "Services · 1", exact: true }),
      ).toBeVisible()
      await expect(preview.getByText("reviewed-app", { exact: true })).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Approve environment", exact: true }),
      ).toBeEnabled()
      await expect(
        page.getByText("Human acceptance is not recorded.", { exact: true }),
      ).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await info.attach(`${width}px / Integration 실행 검토 / 승인 대기와 서비스`, {
        body: await page.screenshot({ animations: "disabled", scale: "css" }),
        contentType: "image/png",
      })
    } finally {
      await review.restore()
    }
  })
}
