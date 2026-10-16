import { test } from "@playwright/test"
import { openLargeCommit } from "../large-commit"

for (const metadataOnly of [false, true]) {
  const state = metadataOnly ? "메타데이터만 표시" : "크기 제한과 파일 목록"
  test(`큰 커밋의 ${state} 상태를 검토한다`, async ({ page, request }, info) => {
    await test.step("실제 큰 커밋의 제한 상태를 연다", () =>
      openLargeCommit(page, request, metadataOnly))
    await page.evaluate(() => document.fonts.ready)
    await info.attach(`Git Graph / 크기 제한 / ${state}`, {
      body: await page.screenshot({ scale: "css" }),
      contentType: "image/png",
    })
  })
}
