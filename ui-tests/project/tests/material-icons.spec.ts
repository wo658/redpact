import { expect, type Locator, test } from "@playwright/test"
import { openWrapDiff, prepareWrapProject } from "../word-wrap"

async function loadedIcon(row: Locator) {
  const icon = row.locator("img:visible")
  await expect(icon).toHaveCount(1)
  await expect(icon).toHaveAttribute("src", /material-icons\/.+\.svg/)
  await expect
    .poll(() =>
      icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true)
  return icon
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("redpact:tools-open", "true"))
})

test("변경 파일의 Material 아이콘과 Git 상태를 표시하고 원문 선택을 유지한다", async ({
  page,
  request,
}) => {
  const restore = await prepareWrapProject(page, request)
  try {
    await test.step("변경 파일에 컬러 아이콘과 수정 상태를 함께 표시한다", async () => {
      await openWrapDiff(page)
      const row = page.getByRole("treeitem", { name: "settings.json", exact: true })
      await loadedIcon(row)
      await expect(row).toContainText("M")
    })
    await test.step("변경 파일 선택과 원문을 유지하며 화면 너비 안에 표시한다", async () => {
      const file = page.getByRole("treeitem", { name: "settings.json", exact: true })
      await expect(file).toHaveAttribute("aria-selected", "true")
      await expect(page.locator(".diff-code").filter({ hasText: "END_URL" })).toBeVisible()
      await page.emulateMedia({ colorScheme: "dark" })
      await expect(page.locator("html")).toHaveClass(/dark/)
      await loadedIcon(file)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => innerWidth),
      )
    })
  } finally {
    await restore()
  }
})
