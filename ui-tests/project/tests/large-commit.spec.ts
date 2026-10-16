import { expect, test } from "@playwright/test"
import { metadataNotice, openLargeCommit, sizeNotice } from "../large-commit"

for (const width of [1920, 390]) {
  test(`${width}px 큰 커밋은 제한과 전체 파일 경로를 표시하고 작은 커밋은 패치를 표시한다`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1080 })
    await test.step("4MiB를 넘는 실제 커밋을 선택한다", () => openLargeCommit(page, request))
    await test.step("잘린 패치나 빈 비교 대신 크기 제한과 모든 경로를 표시한다", async () => {
      const files = page.getByRole("list", { name: "Changed files" })
      await expect(files.getByRole("listitem")).toHaveText(["large.txt", "tail.txt"])
      await expect(page.getByText("No changes in this comparison.")).toHaveCount(0)
    })
    await test.step("작은 커밋으로 바꾸면 제한 안내 없이 원문 변경을 표시한다", async () => {
      await page.locator("web-git-graph").getByText("Small commit", { exact: true }).click()
      await expect(page.getByText(sizeNotice)).toHaveCount(0)
      await expect(page.getByRole("region", { name: "Commit changes" })).toContainText(
        "small change",
      )
    })
  })
}

for (const width of [1920, 390]) {
  test(`${width}px 파일 목록도 제한을 넘으면 부분 목록 없이 별도 안내를 표시한다`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1080 })
    await test.step("파일 경로도 4MiB를 넘는 실제 커밋을 선택한다", () =>
      openLargeCommit(page, request, true))
    await test.step("메타데이터만 표시한다는 안내와 커밋 식별을 보존한다", async () => {
      await expect(page.getByText(metadataNotice, { exact: true })).toBeVisible()
      await expect(page.getByRole("list", { name: "Changed files" })).toHaveCount(0)
      await expect(page.getByText("No changes in this comparison.")).toHaveCount(0)
      await expect(page.getByRole("region", { name: "Commit changes" })).toBeVisible()
    })
  })
}
