import { expect, test } from "@playwright/test"
import { openApp } from "../app"

for (const width of [1280, 390]) {
  test(`${width}px 문맥 없는 화면은 독립 앱 관리 없이 채팅의 실행 링크만 안내한다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const requests: string[] = []
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) {
        requests.push(request.url())
      }
    })
    await openApp(page, "en")
    await expect(
      page.getByRole("heading", { name: "Open an execution from chat", exact: true }),
    ).toBeVisible()
    for (const name of [
      "Tools",
      "Current work",
      "Settings",
      "Project settings",
      "Container",
      "Tests",
      "Connect project",
      "Manage projects",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0)
    }
    await expect(page.getByRole("combobox")).toHaveCount(0)
    await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0)
    expect(requests).toEqual([])
    await page.goto("/?page=review&kind=unknown&id=wrong")
    await expect(page.getByRole("alert")).toContainText("Invalid execution link.")
    expect(requests).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  })
}
