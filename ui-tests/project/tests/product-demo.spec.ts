import { expect, test } from "@playwright/test"

async function holdForDemo(milliseconds = 1800) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

test("Redpact 데모: 변경사항과 실행 근거를 한 작업공간에서 검토한다", async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem("redpact:language", "ko")
    localStorage.setItem("redpact:theme", "light")
  })
  await page.goto("/")

  await test.step("처음 화면에서 검토할 프로젝트를 연결한다", async () => {
    await holdForDemo()
    const response = await request.post("/api/projects", {
      data: { path: "/app", name: "Redpact" },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.addInitScript((projectId) => {
      localStorage.setItem("redpact:project", projectId)
    }, project.id)
    await page.reload()
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible()
    await holdForDemo()
  })

  await test.step("프로젝트 설정에서 실행 구성을 확인한다", async () => {
    await page.getByRole("button", { name: "Project settings", exact: true }).click()
    await holdForDemo()
  })

  await test.step("검토할 작업공간을 연다", async () => {
    const worktrees = page.getByRole("navigation", { name: "Worktrees", exact: true })
    await expect(worktrees.getByRole("button").first()).toBeVisible()
    await worktrees.getByRole("button").first().click()
    await expect(page.getByText("아직 리뷰할 내용이 없습니다.", { exact: true })).toBeVisible()
    for (const name of ["Diff", "Unit Test", "Integration Test", "Log", "Environment", "UI 리뷰"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toHaveCount(0)
    }
    await holdForDemo()
  })

  await test.step("프로젝트 전체 테스트와 실행 기록으로 이어지는 경로를 확인한다", async () => {
    await page.getByRole("button", { name: "Test", exact: true }).click()
    await expect(page.getByRole("tab", { name: "Unit", selected: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "Unit Test", exact: true })).toBeVisible()
    await page.getByRole("tab", { name: "Integration", exact: true }).click()
    await expect(page.getByRole("region", { name: "Integration Test", exact: true })).toBeVisible()
    await page.getByRole("tab", { name: "Playwright", exact: true }).click()
    await expect(page.getByRole("region", { name: "Playwright", exact: true })).toBeVisible()
    await page.getByRole("tab", { name: "실행 기록", exact: true }).click()
    await expect(
      page.getByText("아직 Playwright 실행 기록이 없습니다.", { exact: true }),
    ).toBeVisible()
    await holdForDemo()
  })
})
