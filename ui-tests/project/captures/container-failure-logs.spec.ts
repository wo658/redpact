import { expect, test } from "@playwright/test"
import { openContainerFailureReview } from "../container-failure-logs"

test("실제 컨테이너 준비 실패의 보존된 진단을 촬영한다", async ({ page }, info) => {
  const run = await openContainerFailureReview(page)
  await test.step("실행 로그를 펼치고 실제 실패 원인이 보이는 프레임을 준비한다", async () => {
    await page.getByRole("button", { name: "Execution logs", exact: true }).click()
    const logs = page.getByRole("region", { name: "Execution logs", exact: true })
    await expect(logs).toContainText(run.stderr)
    await logs.scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready)
    await info.attach("실행 검토 / 실패 진단 / 보존된 stderr", {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  })
})
