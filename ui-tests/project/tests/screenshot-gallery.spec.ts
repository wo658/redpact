import { expect, test } from "@playwright/test"
import { openScreenshotGallery } from "../screenshot-gallery"

test("드롭다운 없이 썸네일로 캡처를 선택하고 키보드로 전환한다", async ({ page }) => {
  test.setTimeout(60000)
  await openScreenshotGallery(page)
  const gallery = page.getByRole("radiogroup", { name: "체크포인트", exact: true })
  await test.step("캡처 목록과 첫 번째 큰 이미지를 바로 표시한다", async () => {
    await expect(gallery.getByRole("radio")).toHaveCount(2)
    await expect(page.getByRole("combobox", { name: "체크포인트", exact: true })).toHaveCount(0)
    await expect(
      page.getByRole("heading", { name: "작업공간 / 라이트", exact: true }),
    ).toBeVisible()
    await expect(page.getByAltText("작업공간 / 라이트", { exact: true })).toBeVisible()
  })
  await test.step("썸네일을 클릭하면 선택 상태와 큰 이미지가 함께 바뀐다", async () => {
    const dark = gallery.getByRole("radio", { name: /작업공간 \/ 다크/ })
    await dark.click()
    await expect(dark).toBeChecked()
    await expect(page.getByRole("heading", { name: "작업공간 / 다크", exact: true })).toBeVisible()
    await expect(page.getByAltText("작업공간 / 다크", { exact: true })).toBeVisible()
  })
  await test.step("키보드로 이전 캡처를 선택해도 이미지가 전환된다", async () => {
    await gallery.getByRole("radio", { name: /작업공간 \/ 다크/ }).focus()
    await page.keyboard.press("ArrowLeft")
    await expect(gallery.getByRole("radio", { name: /작업공간 \/ 라이트/ })).toBeChecked()
    await expect(
      page.getByRole("heading", { name: "작업공간 / 라이트", exact: true }),
    ).toBeVisible()
  })
})
