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
    const mobile = (page.viewportSize()?.width ?? 1920) < 768
    if (mobile) {
      await page.getByRole("button", { name: "사이드바 전환", exact: true }).click()
    }
    await page.getByRole("button", { name: "Project settings", exact: true }).click()
    if (mobile) {
      await page.keyboard.press("Escape")
    }
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

test("파일 조회 503을 문제 목록에 모아도 재시도와 원문 탐색을 유지한다", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/projects", {
    data: { path: "/app", name: "File recovery fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id: string) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.id)
  let failing = true
  await page.route("**/api/projects/*/files?**", (route) =>
    failing ? route.fulfill({ status: 503, body: "Temporarily unavailable" }) : route.continue(),
  )
  await page.goto("/")
  const mobile = (page.viewportSize()?.width ?? 1920) < 768
  if (mobile) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await page.getByRole("button", { name: "File Viewer", exact: true }).click()
  if (mobile) {
    await page.keyboard.press("Escape")
  }
  await expect(page.getByRole("button", { name: /^Problems \(/ })).toContainText("1")
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(page.getByText("Request failed (503)", { exact: true })).toHaveCount(0)
  const retry = page.getByRole("button", { name: "Retry", exact: true })
  await expect(retry).toBeVisible()
  failing = false
  await retry.click()
  await expect(page.getByRole("treeitem", { name: "docs", exact: true })).toBeVisible()
  await expect(retry).toHaveCount(0)
  await page.getByRole("button", { name: /^Problems \(/ }).click()
  await expect(
    page
      .getByRole("dialog", { name: "Problems", exact: true })
      .getByText("Request failed (503)", { exact: true }),
  ).toBeVisible()
})
