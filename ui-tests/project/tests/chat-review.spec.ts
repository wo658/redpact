import { expect, test } from "@playwright/test"
import { openApp } from "../app"

for (const width of [1280, 390]) {
  test(`${width}px에서 채팅 중심 현재 작업과 검증 이력 및 보조 도구를 탐색한다`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const connected = await request.post("/api/projects", {
      data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
    })
    expect(connected.ok()).toBeTruthy()
    const project = await connected.json()
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    await test.step("현재 checkout의 작업 상태를 기본 화면에서 확인한다", async () => {
      await expect(page.getByRole("heading", { name: "Current work", exact: true })).toBeVisible()
      await expect(page.getByRole("combobox", { name: "Checkout", exact: true })).toBeVisible()
      await expect(
        page.getByText("Human acceptance is not recorded.", { exact: true }),
      ).toBeVisible()
    })
    if (width < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await test.step("실행 이력만 기본 탐색에 두고 관리 도구는 접어 둔다", async () => {
      const navigation = page.getByRole("navigation", { name: "Review workspace", exact: true })
      await expect(navigation.getByRole("button")).toHaveCount(2)
      await expect(page.getByRole("button", { name: "Container", exact: true })).toBeHidden()
      await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toHaveCount(
        0,
      )
      await navigation.getByRole("button", { name: "Execution history", exact: true }).click()
      await expect(
        page.getByRole("heading", { name: "Execution history", exact: true }),
      ).toBeVisible()
      await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden()
    })
    if (width < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await test.step("보조 도구를 펼치면 검증 설정과 checkout 검토가 유지된다", async () => {
      await page.getByRole("button", { name: "Tools", exact: true }).click()
      await expect(page.getByRole("button", { name: "Tests", exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "File Viewer", exact: true })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Git Graph", exact: true })).toHaveCount(0)
      await expect(page.getByRole("navigation", { name: "Worktrees", exact: true })).toBeVisible()
      await page.getByRole("button", { name: "Project settings", exact: true }).click()
      await expect(
        page.getByRole("heading", { name: "Project settings", exact: true }),
      ).toBeVisible()
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  })
}
