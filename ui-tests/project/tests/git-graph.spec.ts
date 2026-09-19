import { expect, test } from "@playwright/test"

test("Git Graph에서 Fetch와 새로고침을 구분하고 검색과 선택을 유지한다", async ({
  page,
  request,
}) => {
  await test.step("원격이 없는 실제 앱 저장소의 Git Graph를 연다", async () => {
    const response = await request.post("/api/projects", {
      data: { path: "/app", name: "Redpact" },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.addInitScript((id) => {
      localStorage.setItem("redpact:project", id)
      localStorage.setItem("redpact:language", "en")
    }, project.id)
    await page.goto("/")
    await page.getByRole("button", { name: "Git Graph", exact: true }).click()
    await expect(page.locator("web-git-graph")).toHaveAttribute("aria-busy", "false")
  })
  await test.step("Fetch의 원격 미설정 오류를 표시하고 재시도를 허용한다", async () => {
    const fetchButton = page.getByRole("button", { name: "Fetch", exact: true })
    await expect(fetchButton).toBeVisible()
    await fetchButton.click()
    await expect(page.getByText("No Git remotes configured", { exact: true })).toBeVisible()
    await expect(fetchButton).toBeEnabled()
    await fetchButton.click()
    await expect(page.getByText("No Git remotes configured", { exact: true })).toBeVisible()
  })
  await test.step("실패 이후에도 커밋 검색과 변경 파일 선택이 동작한다", async () => {
    const graph = page.locator("web-git-graph")
    await graph.getByRole("searchbox", { name: "Search commits" }).fill("Captured E2E application")
    await expect(graph.locator(".search-count")).toHaveText("1/1")
    await graph.getByText("Captured E2E application", { exact: true }).click()
    await expect(page.getByRole("separator", { name: "Resize commit changes" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Fetch", exact: true })).toBeEnabled()
  })
  await test.step("새로고침은 원격 Fetch 없이 이력을 다시 읽고 검색과 선택을 유지한다", async () => {
    const fetchRequests: string[] = []
    page.on("request", (request) => {
      if (request.url().endsWith("/git/fetch")) {
        fetchRequests.push(request.url())
      }
    })
    const refresh = page.getByRole("button", { name: "Refresh", exact: true })
    await expect(refresh).toBeVisible()
    const history = page.waitForResponse(
      (response) => response.url().includes("/git/graph") && response.request().method() === "GET",
    )
    await refresh.click()
    expect((await history).ok()).toBeTruthy()
    const graph = page.locator("web-git-graph")
    await expect(graph).toHaveAttribute("aria-busy", "false")
    await expect(graph.getByRole("searchbox", { name: "Search commits" })).toHaveValue(
      "Captured E2E application",
    )
    await expect(graph.locator(".row.selected")).toContainText("Captured E2E application")
    await expect(page.getByRole("separator", { name: "Resize commit changes" })).toBeVisible()
    expect(fetchRequests).toEqual([])
  })
})
