import { expect, test } from "@playwright/test"
import { openContainerFailureReview } from "../container-failure-logs"

for (const width of [1280, 390]) {
  test(`${width}px 컨테이너 준비 실패 로그가 실행 화면과 복사 원문에 전달된다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const run = await openContainerFailureReview(page)
    await test.step("새로고침 후에도 같은 실행의 stderr와 상세 로그를 읽는다", async () => {
      await page.reload()
      await expect(page.getByRole("region", { name: "stderr", exact: true })).toContainText(
        run.stderr,
      )
      await page.getByRole("button", { name: "Execution logs", exact: true }).click()
      await expect(page.getByRole("region", { name: "Execution logs", exact: true })).toContainText(
        run.stderr,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
  })
}
