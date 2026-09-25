import { expect, test } from "@playwright/test"
import { openApp } from "../app"

test("헤더가 프로젝트와 현재 페이지를 표시하고 긴 이름과 여러 탭도 화면을 넘지 않는다", async ({
  page,
  request,
}) => {
  const name = "Redpact 프로젝트의 아주 긴 이름 header location regression"
  const response = await request.post("/api/projects", { data: { path: "/app", name } })
  expect(response.ok()).toBeTruthy()
  await openApp(page, "en")
  const tabs = page.getByRole("tablist", { name: "Open workspaces", exact: true })
  async function navigate(label: string) {
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await page.getByRole("button", { name: label, exact: true }).click()
  }
  await test.step("사이드바 이동에 맞춰 현재 위치를 갱신한다", async () => {
    await navigate("Settings")
    await expect(tabs.getByRole("tab", { selected: true })).toHaveAccessibleName(
      `${name} / Settings`,
    )
    await navigate("File Viewer")
    await expect(tabs.getByRole("tab", { selected: true })).toHaveAccessibleName(
      `${name} / File Viewer`,
    )
  })
  await test.step("탭 전환과 좁은 화면에서도 프로젝트와 마지막 위치가 남는다", async () => {
    await page.getByRole("button", { name: "New tab", exact: true }).click()
    await navigate("Settings")
    await tabs.getByRole("tab").first().click()
    await expect(tabs.getByRole("tab", { selected: true })).toHaveAccessibleName(
      `${name} / File Viewer`,
    )
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "New tab", exact: true }).click()
    }
    await expect(tabs.getByRole("tab").last()).toBeInViewport()
    await expect(page.getByRole("button", { name: "New tab", exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 1920,
    )
  })
})
