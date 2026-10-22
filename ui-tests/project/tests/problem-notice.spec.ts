import { expect, test } from "@playwright/test"

test("설정 검증 오류는 inline 없이 문제 목록에만 남긴다", async ({ page, request }) => {
  const response = await request.post("/api/projects", {
    data: { path: "/app", name: "Problem notice fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id: string) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "ko")
  }, project.id)
  await page.goto("/")
  await test.step("실제 프로젝트 설정의 필수 Playwright 서비스를 제거해 검증 오류를 표시한다", async () => {
    await page.getByRole("button", { name: "Project settings", exact: true }).click()
    const service = page.locator('input[name="playwright.service"]')
    await expect(service).toHaveValue("app")
    await service.fill("")
    await page.getByRole("button", { name: "설정 저장", exact: true }).click()
    await expect(page.getByRole("alert")).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "문제 상세", exact: true })).toHaveCount(0)
  })
  await test.step("문제 목록은 직접 열 때만 오류 진단을 표시한다", async () => {
    await expect(page.getByRole("dialog", { name: "문제 목록", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: /^문제 목록 \(/ }).click()
    const dialog = page.getByRole("dialog", { name: "문제 목록", exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/playwright/)).toBeVisible()
  })
})
