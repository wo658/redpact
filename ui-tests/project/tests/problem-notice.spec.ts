import { expect, type Page, test } from "@playwright/test"
import { isOnScreen } from "../app"

async function navigate(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true })
  if (!(await isOnScreen(button))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await button.click()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.keyboard.press("Escape")
  }
}

test.beforeEach(async ({ page, request }) => {
  const response = await request.post("/api/projects", {
    data: { path: "/app", name: "Problem notice fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id: string) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
    window.history.replaceState(
      {
        redpactWorkspace: {
          id: `project:${id}`,
          kind: "project",
          label: "Problem notice fixture",
          projectId: id,
          view: { page: "project-settings", selectedId: "" },
        },
      },
      "",
    )
  }, project.id)
})

test("설정 검증 오류는 토스트로 알리고 상세 진단은 전역 Settings에 보존한다", async ({ page }) => {
  await page.goto("/")
  await test.step("프로젝트 설정 검증은 본문 오류나 문제 버튼을 추가하지 않는다", async () => {
    await navigate(page, "Project settings")
    const service = page.locator('input[name="playwright.service"]')
    await expect(service).toHaveValue("app")
    await service.fill("")
    await page.getByRole("button", { name: "Save settings", exact: true }).click()
    await expect(page.locator('[data-slot="toast-title"]')).toHaveText("Problem recorded")
    await expect(page.locator('main [role="alert"]')).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Problem details", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Problems \(/ })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: /^Problems \(/ })).toHaveCount(0)
  })
  await test.step("토스트를 닫아도 Settings의 상세 진단은 남는다", async () => {
    await page.locator('[data-slot="toast-title"]').click()
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(0)
    await navigate(page, "Settings")
    const problems = page.getByRole("region", { name: "Problems (1)", exact: true })
    await expect(problems).toBeVisible()
    await expect(problems.locator("li")).toHaveCount(1)
    await expect(problems.locator("li")).toContainText(/playwright/i)
    await expect(page.locator('[data-slot="dialog-content"]:visible')).toHaveCount(0)
  })
})

test("파일 조회 503을 Settings에 보존해도 재시도와 원문 탐색을 유지한다", async ({ page }) => {
  let failing = true
  await page.route("**/api/projects/*/files?**", (route) =>
    failing ? route.fulfill({ status: 503, body: "Temporarily unavailable" }) : route.continue(),
  )
  await page.goto("/")
  await navigate(page, "File Viewer")
  await expect(page.locator('[data-slot="toast-title"]')).toHaveText("Problem recorded")
  await expect(page.getByRole("button", { name: /^Problems \(/ })).toHaveCount(0)
  await expect(page.locator('main [role="alert"]')).toHaveCount(0)
  await expect(page.getByText("Request failed (503)", { exact: true })).toHaveCount(0)
  const retry = page.getByRole("button", { name: "Retry", exact: true })
  await expect(retry).toBeVisible()
  failing = false
  await retry.click()
  await expect(page.getByRole("treeitem", { name: "docs", exact: true })).toBeVisible()
  await expect(retry).toHaveCount(0)
  await navigate(page, "Settings")
  const problems = page.getByRole("region", { name: "Problems (1)", exact: true })
  await expect(problems.getByText("Request failed (503)", { exact: true })).toBeVisible()
  await expect(page.locator('[data-slot="dialog-content"]:visible')).toHaveCount(0)
})
