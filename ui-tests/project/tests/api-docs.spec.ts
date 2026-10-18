import { expect, test } from "@playwright/test"

for (const width of [1280, 390]) {
  test(`${width}px API 문서는 토큰 없이 열리고 로컬 접근 경계와 명세를 안내한다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ["/docs", "/swagger", "/redoc"]) {
      await test.step(`${path} 안내와 명세를 확인한다`, async () => {
        const response = await page.goto(path)
        expect(response?.status()).toBe(200)
        await expect(page.getByText("No API token is required.", { exact: false })).toBeVisible()
        await expect(page.getByText("local host and same-origin", { exact: false })).toBeVisible()
        await expect(page.locator("body")).not.toContainText("REDPACT_TOKEN")
        await expect(page.getByRole("button", { name: "Authorize", exact: true })).toHaveCount(0)
        await expect(
          page.getByRole("heading", { name: "Redpact API", exact: false }).first(),
        ).toBeVisible()
        await page
          .getByRole("navigation", { name: "API documentation" })
          .getByRole("link", { name: "OpenAPI JSON" })
          .click()
        await expect(page).toHaveURL(/\/openapi\.json$/)
        const specification = JSON.parse(await page.locator("body").innerText())
        expect(specification.security).toEqual([])
        expect(specification.paths["/api/health"].get).toBeTruthy()
      })
    }
  })
}
