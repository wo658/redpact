import { expect, test } from "@playwright/test"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("설정 검증 오류도 공통 Handoff shell로 복사한다", async ({ page, request }) => {
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
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  })

  await test.step("실제 프로젝트 설정의 필수 Playwright 서비스를 제거해 검증 오류를 표시한다", async () => {
    await page.getByRole("button", { name: "Project settings", exact: true }).click()
    const service = page.locator('input[name="playwright.service"]')
    await expect(service).toHaveValue("app")
    await service.fill("")
    await page.getByRole("button", { name: "설정 저장", exact: true }).click()
    await expect(page.getByRole("heading", { name: "문제 상세", exact: true })).toBeVisible()
  })
  await test.step("공통 오류 shell은 표시된 진단과 Copy 동작을 함께 제공한다", async () => {
    const shell = page
      .getByRole("heading", { name: "문제 상세", exact: true })
      .locator("..")
      .locator("..")
    const diagnostic = await shell.getByRole("alert").innerText()
    await expect(diagnostic).not.toBe("")
    await shell.getByRole("button", { name: "복사", exact: true }).click()
    await expect(shell.getByRole("button", { name: "복사됨", exact: true })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(`메시지: ${diagnostic}`)
  })
})
