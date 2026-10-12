import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("헤더가 프로젝트와 현재 페이지를 표시하고 긴 이름과 여러 탭도 화면을 넘지 않는다", async ({
  page,
  request,
}) => {
  const name = "Redpact 프로젝트의 아주 긴 이름 header location regression"
  const response = await request.post("/api/projects", { data: { path: "/app", name } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  expect((await request.patch(`/api/projects/${project.id}`, { data: { name } })).ok()).toBeTruthy()
  try {
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    const tabs = page.getByRole("tablist", { name: "Open workspaces", exact: true })
    async function openSidebar() {
      if ((page.viewportSize()?.width ?? 1920) < 768) {
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).first().click()
      }
    }
    async function navigate(label: string) {
      await openSidebar()
      await page.getByRole("button", { name: label, exact: true }).click()
      await page.keyboard.press("Escape")
    }
    await test.step("워크트리를 선택해도 사이드바 메뉴만 표시한다", async () => {
      await openSidebar()
      await page
        .getByRole("navigation", { name: "Worktrees", exact: true })
        .getByRole("button")
        .first()
        .click()
      await page.keyboard.press("Escape")
      await expect(tabs.getByRole("tab", { selected: true })).toHaveAccessibleName(
        `${name} / Worktrees`,
      )
      await expect(tabs.getByRole("tab", { selected: true })).not.toContainText("… /")
    })
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
  } finally {
    expect(
      (await request.patch(`/api/projects/${project.id}`, { data: { name: project.name } })).ok(),
    ).toBeTruthy()
  }
})
