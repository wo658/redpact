import { expect, type Locator, type Page, type TestInfo, test } from "@playwright/test"

async function capture(page: Page, info: TestInfo, name: string, component: Locator) {
  await test.step(`${name} 페이지와 헤더를 함께 캡처한다`, async () => {
    await expect(component).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await info.attach(name, {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  })
}

/** 실제 앱의 상태를 준비하고 헤더와 탐색 영역을 포함한 페이지를 보관한다. */
test("앱 문맥에서 설정을 확인하고 주요 페이지 상태를 검토한다", async ({ page, request }, info) => {
  await test.step("실제 앱 소스를 연결하고 한국어 작업공간을 연다", async () => {
    const response = await request.post("/api/projects", {
      data: { path: "/app", name: "Redpact" },
    })
    expect(response.ok()).toBeTruthy()
    await page.addInitScript(() => {
      localStorage.setItem("redpact:language", "ko")
      localStorage.setItem("redpact:theme", "light")
    })
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible()
  })
  const workspaceTabs = page.getByRole("tablist", { name: "열린 작업공간", exact: true })
  await expect(workspaceTabs.getByRole("tab", { name: /^Redpact \/ / })).toBeVisible()
  await capture(page, info, "작업공간 / 헤더 / 프로젝트 탭", workspaceTabs)
  const navigation = page.getByRole("navigation", { name: "Worktrees", exact: true })
  await expect(navigation.getByRole("button").first()).toBeVisible()
  await capture(page, info, "작업공간 / 탐색 / 작업공간 탐색", navigation)
  const worktree = navigation.getByRole("button").first()
  const worktreeName = await worktree.getAttribute("aria-label")
  expect(worktreeName, "워크트리 이름이 접근성 레이블로 제공되어야 한다").toBeTruthy()
  await worktree.click()
  await expect(
    workspaceTabs.getByRole("tab", { name: `Redpact / ${worktreeName ?? ""}`, exact: true }),
  ).toBeVisible()
  await expect(page.getByText("아직 리뷰할 내용이 없습니다.", { exact: true })).toBeVisible()
  const emptyReview = page.getByText("아직 리뷰할 내용이 없습니다.", { exact: true })
  await expect(emptyReview).toBeVisible()
  for (const name of ["Diff", "Unit Test", "Integration Test", "Log", "Environment", "UI 리뷰"]) {
    await expect(page.getByRole("tab", { name, exact: true })).toHaveCount(0)
  }
  await capture(page, info, "워크트리 / 리뷰 / 내용 없는 탭 숨김", emptyReview)
  await capture(page, info, "작업공간 / 헤더 / 워크트리 탭", workspaceTabs)
  await page
    .getByRole("button", { name: /Redpact/ })
    .first()
    .click()
  await capture(page, info, "작업공간 / 탐색 / 프로젝트 메뉴", page.getByRole("menu"))
  await page.keyboard.press("Escape")
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, info, "작업공간 / 헤더 / 워크트리 탭 모바일", workspaceTabs)
  await page.setViewportSize({ width: 1920, height: 1080 })

  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Settings", exact: true, level: 1 })).toBeVisible()
  const settingsRow = (name: string) =>
    page.locator(`[data-slot="settings-row"][aria-label="${name}"]`)
  await expect(page.getByRole("combobox", { name: "테마", exact: true })).toHaveValue("라이트")
  await capture(page, info, "설정 / 페이지 / 라이트 테마", settingsRow("테마"))
  await test.step("실제 테마 선택을 다크로 바꾼다", async () => {
    await page.getByRole("combobox", { name: "테마", exact: true }).click()
    await page.getByRole("option", { name: "다크", exact: true }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
  })
  await capture(page, info, "설정 / 페이지 / 다크 테마", settingsRow("테마"))
  await page.getByRole("combobox", { name: "테마", exact: true }).click()
  await page.getByRole("option", { name: "라이트", exact: true }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)
  await expect(settingsRow("MCP 승인").getByRole("combobox")).toBeEnabled()

  await page.getByRole("button", { name: "Project settings", exact: true }).click()
  await expect(settingsRow("기준 브랜치")).toBeVisible()
  const configuration = page.getByRole("region", { name: "Project settings", exact: true })
  await expect(
    configuration.getByRole("textbox", { name: "테스트 디렉터리", exact: true }),
  ).toBeVisible()
  await capture(page, info, "프로젝트 설정 / 실행 구성 / 프로젝트 실행 설정", configuration)
  await page.getByRole("button", { name: "Git Graph", exact: true }).click()
  const graph = page.locator("web-git-graph")
  await expect(graph).toHaveAttribute("aria-busy", "false")
  await expect(graph.getByText("Captured E2E application", { exact: true })).toBeVisible()
  await capture(page, info, "Git Graph / 페이지 / 커밋 기록", graph)
  await page.getByRole("button", { name: "Dependencies", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "프로젝트 Dependencies", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("선언된 dependency가 없습니다.", { exact: true })).toBeVisible()
  await capture(
    page,
    info,
    "Dependencies / 개요 / 빈 상태",
    page.getByRole("region", { name: "프로젝트 Dependencies", exact: true }),
  )

  await page.getByRole("button", { name: "Test", exact: true }).click()
  await expect(page.getByRole("tab", { name: "Unit", selected: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Unit Test", exact: true })).toBeVisible()
  await capture(
    page,
    info,
    "프로젝트 / Unit / 단위테스트 미설정",
    page.getByRole("region", { name: "Unit Test", exact: true }),
  )
  await page.getByRole("tab", { name: "Integration", exact: true }).click()
  await expect(page.getByRole("region", { name: "Integration Test", exact: true })).toBeVisible()
  await capture(
    page,
    info,
    "프로젝트 / Integration / 통합테스트 소스",
    page.getByRole("region", { name: "Integration Test", exact: true }),
  )
  await page.getByRole("tab", { name: "Playwright", exact: true }).click()
  await expect(
    page.getByText("아직 스크린샷이 없습니다. 워크트리에서 캡처 대상을 실행하세요.", {
      exact: true,
    }),
  ).toBeVisible()
  await capture(
    page,
    info,
    "Playwright / 스크린샷 / 프로젝트 Playwright 기록",
    page.getByRole("region", { name: "Playwright", exact: true }),
  )
  await page.getByRole("tab", { name: "Test", exact: true }).click()
  await expect(page.getByRole("treeitem", { name: "settings.spec.ts", exact: true })).toBeVisible()
  await capture(
    page,
    info,
    "Playwright / Test / 기능 테스트 목록",
    page.getByRole("region", { name: "Playwright", exact: true }),
  )
  await page.getByRole("treeitem", { name: "settings.spec.ts", exact: true }).click()
  await expect(
    page.getByText("선택한 테마는 새로고침 후에도 유지된다", { exact: false }),
  ).toBeVisible()
  await capture(
    page,
    info,
    "Playwright / Test / 실행 전 기능 테스트 파일",
    page.getByRole("region", { name: "Playwright", exact: true }),
  )
  await page.getByRole("tab", { name: "실행 기록", exact: true }).click()
  await expect(
    page.getByText("아직 Playwright 실행 기록이 없습니다.", { exact: true }),
  ).toBeVisible()
  await capture(
    page,
    info,
    "Playwright / 실행 기록 / 빈 상태",
    page.getByRole("region", { name: "Playwright", exact: true }),
  )
})
