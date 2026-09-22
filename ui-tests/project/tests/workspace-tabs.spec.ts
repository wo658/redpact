import { expect, test } from "@playwright/test"
import { openApp } from "../app"

test("헤더에서 새 탭을 열고 전환하고 닫아도 기존 작업공간을 유지한다", async ({
  page,
  request,
}) => {
  const connected = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(connected.ok(), "실제 앱 프로젝트 연결이 성공한다").toBeTruthy()
  await openApp(page, "ko")
  const tabs = page.getByRole("tablist", { name: "열린 작업공간", exact: true })
  await expect(tabs.getByRole("tab")).toHaveCount(1)
  let original = await tabs.getByRole("tab").innerText()
  const add = page.getByRole("button", { name: "새 탭", exact: true })
  await test.step("새 탭 버튼으로 독립된 프로젝트 탭을 연다", async () => {
    await expect(add).toBeVisible()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "사이드바 전환", exact: true }).click()
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    original = await tabs.getByRole("tab").innerText()
    await add.click()
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    await expect(tabs.getByRole("tab")).toHaveCount(2)
    await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true")
    await expect(tabs.getByRole("tab").first()).toHaveText(original)
    await tabs.getByRole("tab").first().click()
    await expect(tabs.getByRole("tab").first()).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  })
  await test.step("여러 탭에서도 새 탭과 선택된 탭에 접근한다", async () => {
    for (let index = 0; index < 6; index++) {
      await add.click()
    }
    await expect(tabs.getByRole("tab")).toHaveCount(8)
    await expect(tabs.getByRole("tab").last()).toBeInViewport()
    await expect(add).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 1920,
    )
  })
  await test.step("선택된 탭을 닫으면 이웃 탭으로 돌아간다", async () => {
    await tabs
      .getByRole("button", { name: `${original} 닫기`, exact: true })
      .last()
      .click()
    await expect(tabs.getByRole("tab")).toHaveCount(7)
    await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true")
    await expect(tabs.getByRole("tab").last()).toBeInViewport()
  })
})

test("탭마다 파일 탐색 상태와 Test 하위 탭을 독립적으로 유지한다", async ({ page, request }) => {
  const connected = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(connected.ok()).toBeTruthy()
  await openApp(page, "en")
  const tabs = page.getByRole("tablist", { name: "Open workspaces", exact: true })
  async function navigate(name: string) {
    const button = page.getByRole("button", { name, exact: true })
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await button.click()
    await page.keyboard.press("Escape")
  }
  await test.step("첫 탭에서 폴더와 파일을 선택한다", async () => {
    await navigate("File Viewer")
    await page.getByRole("treeitem", { name: "docs", exact: true }).click()
    await page.getByRole("treeitem", { name: "frontend.md", exact: true }).click()
    await expect(page.getByRole("treeitem", { name: "frontend.md", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })
  const sourceScroll = page.locator(".diff-source:visible").locator("..")
  await expect(sourceScroll).toBeVisible()
  await sourceScroll.evaluate((element) => {
    element.scrollTop = 300
  })
  const scrollTop = await sourceScroll.evaluate((element) => element.scrollTop)
  expect(scrollTop, "선택한 파일 본문을 실제로 스크롤한다").toBeGreaterThan(200)
  await test.step("새 탭에서는 Integration을 선택한다", async () => {
    await page.getByRole("button", { name: "New tab", exact: true }).click()
    await expect(page.getByRole("treeitem", { name: "frontend.md", exact: true })).toHaveCount(0)
    await navigate("Tests")
    await page.getByRole("tab", { name: "Integration", exact: true }).click()
  })
  await test.step("첫 탭의 폴더 펼침과 파일 선택을 복원한다", async () => {
    await tabs.getByRole("tab").first().click()
    await expect(page.getByRole("treeitem", { name: "docs", exact: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    await expect(page.getByRole("treeitem", { name: "frontend.md", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })
  expect(
    await sourceScroll.evaluate((element) => element.scrollTop),
    "파일 스크롤 위치를 유지한다",
  ).toBe(scrollTop)
  await test.step("둘째 탭은 Unit으로 초기화되지 않고 Integration을 유지한다", async () => {
    await tabs.getByRole("tab").nth(1).click()
    await expect(page.getByRole("tab", { name: "Integration", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(page.getByRole("treeitem", { name: "frontend.md", exact: true })).toHaveCount(0)
  })
  await test.step("워크트리 이동은 첫 탭만 바꾸고 두 번째 탭의 Tests는 유지한다", async () => {
    await tabs.getByRole("tab").first().click()
    const navigation = page.getByRole("navigation", { name: "Worktrees", exact: true })
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await expect(navigation).toBeVisible()
    await navigation.getByRole("button").first().click()
    await page.keyboard.press("Escape")
    await expect(tabs.getByRole("tab")).toHaveCount(2)
    await expect(tabs.getByRole("tab").first()).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("treeitem", { name: "frontend.md", exact: true })).toHaveCount(0)
    await tabs.getByRole("tab").nth(1).click()
    await expect(page.getByRole("tab", { name: "Integration", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })
})

test("프로젝트를 선택해도 다른 탭으로 이동하지 않고 닫기는 연결을 유지한다", async ({
  page,
  request,
}) => {
  const first = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  const second = await request.post("/api/projects", {
    data: { path: "/app/docs", name: "Documentation" },
  })
  expect(first.ok()).toBeTruthy()
  expect(second.ok()).toBeTruthy()
  const project = await first.json()
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page, "en")
  const tabs = page.getByRole("tablist", { name: "Open workspaces", exact: true })
  await expect(tabs.getByRole("tab")).toHaveCount(1)
  await page.getByRole("button", { name: "New tab", exact: true }).click()
  async function chooseProject(current: string, next: string) {
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await page.getByRole("button", { name: current, exact: true }).click()
    await page.getByRole("menuitemradio", { name: next, exact: true }).click()
    await page.keyboard.press("Escape")
  }
  await test.step("둘째 탭에서 프로젝트를 바꾼 뒤 첫째 탭과 같은 프로젝트로 돌아온다", async () => {
    await chooseProject("Redpact", "Documentation")
    await expect(tabs.getByRole("tab")).toHaveCount(2)
    await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true")
    await chooseProject("Documentation", "Redpact")
    await expect(tabs.getByRole("tab")).toHaveCount(2)
    await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true")
  })
  await test.step("닫기 동작은 서버 변경 요청 없이 현재 탭만 제거한다", async () => {
    const mutations: string[] = []
    page.on("request", (req) => {
      if (
        !["GET", "HEAD"].includes(req.method()) &&
        new URL(req.url()).pathname.startsWith("/api/")
      ) {
        mutations.push(req.url())
      }
    })
    await tabs
      .getByRole("button", { name: /Close / })
      .last()
      .click()
    await expect(tabs.getByRole("tab")).toHaveCount(1)
    expect(mutations, "닫기는 실행 중지나 프로젝트 연결 해제 API를 호출하지 않는다").toEqual([])
    const projects = await (await request.get("/api/projects")).json()
    expect(projects.some((item: { id: string }) => item.id === project.id)).toBeTruthy()
  })
  await test.step("새로고침하면 세션 탭 목록을 초기화한다", async () => {
    await page.getByRole("button", { name: "New tab", exact: true }).click()
    await expect(tabs.getByRole("tab")).toHaveCount(2)
    await page.reload()
    await expect(tabs.getByRole("tab")).toHaveCount(1)
  })
})
