import { expect, test } from "@playwright/test"
import { isOnScreen, openApp } from "../app"

// 영문 탐색 계약을 명시적으로 검증한다.
test("공용 헤더가 작업공간 탭 없이 화면 탐색과 사이드바 제어를 제공한다", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok(), "실제 앱 프로젝트를 연결한다").toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page, "en")
  const header = page.locator(".app-header:visible")
  await expect(header).toBeVisible()
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "New tab", exact: true })).toHaveCount(0)
  const toggle = header.getByRole("button", { name: "Toggle Sidebar", exact: true })
  await expect(toggle).toBeVisible()
  async function navigate(name: string) {
    const button = page.getByRole("button", { name, exact: true })
    if (!(await isOnScreen(button))) {
      await toggle.click()
    }
    await button.click()
    await page.keyboard.press("Escape")
  }
  await test.step("파일 탐색기와 설정이 공용 헤더에 제목을 표시한다", async () => {
    await navigate("File Viewer")
    await expect(header.getByRole("heading", { name: "File Viewer", exact: true })).toBeVisible()
    await navigate("Settings")
    await expect(header.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  })
  await test.step("브라우저 뒤로 앞으로 이동과 새로고침이 현재 화면을 복원한다", async () => {
    await page.goBack()
    await expect(header.getByRole("heading", { name: "File Viewer", exact: true })).toBeVisible()
    await page.goForward()
    await expect(header.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    await page.reload()
    await expect(header.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  })
  await test.step("프로젝트 테스트 탭과 실행 버튼이 같은 헤더에 위치한다", async () => {
    await navigate("Tests")
    await expect(header.getByRole("tab", { name: "Unit", exact: true })).toBeVisible()
    await header.getByRole("tab", { name: "Integration", exact: true }).click()
    await expect(header.getByRole("tab", { name: "Integration", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(
      header.getByRole("button", { name: "Run Integration tests", exact: true }),
    ).toBeVisible()
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    "페이지 전체가 가로로 넘치지 않는다",
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 1920)
})
