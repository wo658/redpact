import { expect, test } from "@playwright/test"
import { openExecutionScope } from "../execution-scope-fixture"

for (const width of [1920, 414]) {
  test(`${width}px 실행 결과는 변경 범위와 정확한 선택 파일을 구분한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const fixture = await test.step("실제 앱에 변경 범위 요청을 기록하고 결과를 연다", () =>
      openExecutionScope(page))
    await test.step("요청 범위와 비교 커밋·실행 파일이 표시되고 전체 파일로 오해되지 않는다", async () => {
      await expect(fixture.scope.getByText(/Requested scope: Changed tests/)).toBeVisible()
      await expect(fixture.scope.getByText(/Resolved scope: Changed tests/)).toBeVisible()
      await expect(fixture.scope.getByText("unit/a.test.ts", { exact: true })).toBeVisible()
      await expect(fixture.scope.getByText("unit/b.test.ts", { exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
    await test.step("실제 Unit 실행 컨트롤에서 전체 범위로 재정의한다", async () => {
      await page.goto("/")
      await page
        .getByRole("navigation", { name: "Worktrees", exact: true })
        .getByRole("button")
        .first()
        .click()
      await page.getByRole("tab", { name: "Unit Test", exact: true }).click()
      await page.getByRole("combobox", { name: "Execution scope", exact: true }).click()
      await page.getByRole("option", { name: "All tests", exact: true }).click()
      const response = page.waitForResponse(
        (response) =>
          response.url().includes("/unit-tests/run") && response.request().method() === "POST",
      )
      await page.getByRole("button", { name: "Run Unit command", exact: true }).click()
      const result = await response
      expect(result.status()).toBe(200)
      expect(result.request().postDataJSON()).toEqual({ executionScope: "all" })
      expect((await result.json()).executionSelection.files).toEqual([
        "unit/a.test.ts",
        "unit/b.test.ts",
      ])
    })
  })
}
