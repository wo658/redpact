import { expect, test } from "@playwright/test"
import { openApp } from "../app"

for (const width of [1280, 390]) {
  test(`${width}px 전체 앱 홈과 잘못된 실행 링크의 진단을 촬영한다`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const response = await request.post("/api/projects", {
      data: { path: "/app", name: "Redpact" },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    await expect(page.getByText("No review content yet.", { exact: true })).toBeVisible()
    if (width < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await info.attach(`${width}px / 전체 앱 탐색`, {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
    await page.goto("/?page=review&kind=unknown&id=wrong")
    await expect(page.getByRole("alert")).toContainText("Invalid execution link.")
    await info.attach(`${width}px / 잘못된 링크`, {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  })
}
