import { expect, test } from "@playwright/test"
import { openApp } from "../app"

for (const width of [1280, 390]) {
  test(`${width}px 현재 작업과 검증 이력의 간소화된 화면을 촬영한다`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const response = await request.post("/api/projects", {
      data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    await expect(page.getByRole("heading", { name: "Current work", exact: true })).toBeVisible()
    await expect(page.getByText("Human acceptance is not recorded.", { exact: true })).toBeVisible()
    await expect(page.getByText("Loading current work…", { exact: true })).toBeHidden()
    await expect(page.getByText("No requests awaiting approval.", { exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await testInfo.attach(`${width}px / 현재 작업`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    })
    if (width < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await page.getByRole("button", { name: "Execution history", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: "Execution history", exact: true }),
    ).toBeVisible()
    const history = page.getByRole("region", { name: "Execution logs", exact: true })
    await expect(history.getByText("Loading execution…", { exact: true })).toBeHidden()
    await expect(history.getByText("No executions yet", { exact: true })).toBeVisible()
    await testInfo.attach(`${width}px / 실행 이력`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    })
  })
}
