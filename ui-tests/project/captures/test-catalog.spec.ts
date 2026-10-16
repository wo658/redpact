import { expect, test } from "@playwright/test"
import { prepareTestCatalog } from "../test-catalog"

test("대규모 테스트 목록의 마지막 파일과 크기 오류를 캡처한다", async ({ page }, info) => {
  test.setTimeout(90000)
  await test.step("대규모 프로젝트의 실제 Tests 화면을 연다", () => prepareTestCatalog(page))
  for (const kind of ["Unit", "Integration"] as const) {
    await test.step(`${kind} 마지막 파일을 선택하고 화면을 보관한다`, async () => {
      await page.getByRole("tab", { name: kind, exact: true }).click()
      await page.getByRole("treeitem", { name: "file-209.test.ts", exact: true }).click()
      await expect(page.locator(".diff-source")).toContainText(`${kind.toUpperCase()}_SOURCE_209`)
      await page.evaluate(() => document.fonts.ready)
      await info.attach(`테스트 탐색 / ${kind} / 마지막 파일`, {
        body: await page.screenshot({ animations: "disabled", scale: "css" }),
        contentType: "image/png",
      })
      await page.getByRole("treeitem", { name: "oversize.test.ts", exact: true }).click()
      await expect(
        page.getByText("Source preview exceeds its size limit", { exact: true }),
      ).toBeVisible()
      await info.attach(`테스트 탐색 / ${kind} / 크기 제한`, {
        body: await page.screenshot({ animations: "disabled", scale: "css" }),
        contentType: "image/png",
      })
    })
  }
})
