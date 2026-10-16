import { expect, test } from "@playwright/test"
import { prepareTestCatalog } from "../test-catalog"

test("200개 이후 테스트를 탐색하고 늦은 응답이 현재 선택을 덮어쓰지 않는다", async ({ page }) => {
  test.setTimeout(90000)
  await test.step("실제 앱에 대규모 Unit 및 Integration 프로젝트를 연결한다", () =>
    prepareTestCatalog(page))
  for (const kind of ["Unit", "Integration"] as const) {
    await test.step(`${kind}의 210번째 파일 소스와 오류 상태를 확인한다`, async () => {
      await page.getByRole("tab", { name: kind, exact: true }).click()
      await page.getByRole("treeitem", { name: "file-209.test.ts", exact: true }).click()
      await expect(page.locator(".diff-source")).toContainText(`${kind.toUpperCase()}_SOURCE_209`)
      await page.getByRole("treeitem", { name: "oversize.test.ts", exact: true }).click()
      await expect(
        page.getByText("Source preview exceeds its size limit", { exact: true }),
      ).toBeVisible()
      await expect(page.locator(".diff-source")).toHaveCount(0)
      await page.getByRole("treeitem", { name: "binary.test.ts", exact: true }).click()
      await expect(
        page.getByText("Binary source cannot be previewed", { exact: true }),
      ).toBeVisible()
      await page.getByRole("treeitem", { name: "symlink.test.ts", exact: true }).click()
      await expect(
        page.getByText("Symlinked test files cannot be previewed", { exact: true }),
      ).toBeVisible()
    })
    await test.step(`${kind}에서 늦게 도착한 이전 소스를 무시한다`, async () => {
      let release!: () => void
      let requested!: () => void
      let delivered!: () => void
      const finished = new Promise<void>((resolve) => {
        delivered = resolve
      })
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const started = new Promise<void>((resolve) => {
        requested = resolve
      })
      const pattern = `**/${kind.toLowerCase()}-tests/source?*file-001.test.ts`
      // 응답 본문은 실제 서버에서 읽고 전달 시점만 늦춘다.
      await page.route(pattern, async (route) => {
        const response = await route.fetch()
        requested()
        await held
        await route.fulfill({ response }).catch(() => {})
        delivered()
      })
      await page.getByRole("treeitem", { name: "file-001.test.ts", exact: true }).click()
      await started
      await page.getByRole("treeitem", { name: "file-209.test.ts", exact: true }).click()
      await expect(page.locator(".diff-source")).toContainText(`${kind.toUpperCase()}_SOURCE_209`)
      release()
      await finished
      await page.unroute(pattern)
      await expect(page.locator(".diff-source")).not.toContainText(
        `${kind.toUpperCase()}_SOURCE_1\n`,
      )
      await expect(
        page.getByRole("treeitem", { name: "file-209.test.ts", exact: true }),
      ).toHaveAttribute("aria-selected", "true")
    })
  }
})
