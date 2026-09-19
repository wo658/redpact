import { expect, type Locator, test } from "@playwright/test"
import { openNavigation, openWrapDiff, prepareWrapProject } from "../word-wrap"

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

test("Material 파일 아이콘과 폴더 상태를 표시하고 Git 변경 및 원문 선택을 유지한다", async ({
  page,
  request,
}) => {
  const restore = await prepareWrapProject(page, request)
  try {
    await test.step("변경 파일에 컬러 아이콘과 수정 상태를 함께 표시한다", async () => {
      await openWrapDiff(page)
      const row = page.getByRole("treeitem", { name: /settings.json/ })
      await loadedIcon(row)
      await expect(row).toContainText("M")
    })
    await test.step("파일 보기에서 폴더를 펼치고 파일을 선택한다", async () => {
      await openNavigation(page, "File Viewer")
      const folder = page.getByRole("treeitem", { name: "app", exact: true })
      const closed = await (await loadedIcon(folder)).getAttribute("src")
      await folder.click()
      await expect(folder).toHaveAttribute("aria-expanded", "true")
      expect(await (await loadedIcon(folder)).getAttribute("src")).not.toBe(closed)
      await folder.click()
      await expect(folder).toHaveAttribute("aria-expanded", "false")
      expect(await (await loadedIcon(folder)).getAttribute("src")).toBe(closed)
      const file = page.getByRole("treeitem", { name: "package.json", exact: true })
      const src = await (await loadedIcon(file)).getAttribute("src")
      await file.click()
      await expect(file).toHaveAttribute("aria-selected", "true")
      await expect(page.locator(".diff-source")).toContainText('"name"')
      await expect(
        page
          .locator("code")
          .filter({ hasText: /^package\.json$/ })
          .locator("..")
          .locator("img:visible"),
      ).toHaveAttribute("src", src ?? "")
    })
    await test.step("테마 전환에 따라 TOML 아이콘 변형을 바꾸고 원문을 유지한다", async () => {
      for (const name of ["app", "desktop", "src-tauri"]) {
        await page.getByRole("treeitem", { name, exact: true }).click()
      }
      const file = page.getByRole("treeitem", { name: "Cargo.toml", exact: true })
      await expect(await loadedIcon(file)).toHaveAttribute("src", /toml_light\.svg$/)
      await file.click()
      await expect(page.locator(".diff-source")).toContainText("[package]")
      await page.emulateMedia({ colorScheme: "dark" })
      await expect(page.locator("html")).toHaveClass(/dark/)
      await expect(await loadedIcon(file)).toHaveAttribute("src", /\/toml\.svg$/)
      await expect(page.locator(".diff-source")).toContainText("[package]")
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => innerWidth),
      )
    })
  } finally {
    await restore()
  }
})
