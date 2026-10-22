import { expect, test } from "@playwright/test"
import { isOnScreen, openApp } from "../app"

test("페이지를 바꾸면 공용 헤더의 제목과 탐색을 교체한다", async ({ page, request }) => {
  const name = "Redpact 프로젝트의 아주 긴 이름 header location regression"
  const response = await request.post("/api/projects", { data: { path: "/app", name } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page, "en")
  const header = page.locator(".app-header:visible")
  async function navigate(label: string) {
    const button = page.getByRole("button", { name: label, exact: true })
    if (!(await isOnScreen(button))) {
      await header.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await button.click()
    await page.keyboard.press("Escape")
  }
  for (const title of ["File Viewer", "Git Graph", "Container", "Project settings", "Settings"]) {
    await test.step(`${title}의 제목을 공용 헤더로 옮긴다`, async () => {
      await navigate(title)
      await expect(header.getByRole("heading", { name: title, exact: true })).toBeVisible()
      await expect(header.getByRole("button", { name: "Fetch", exact: true })).toHaveCount(0)
      await expect(
        header.getByRole("button", { name: "Toggle Sidebar", exact: true }),
      ).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? 1920,
      )
    })
  }
  await test.step("Dependencies와 Tests의 탭도 공용 헤더에서 작동한다", async () => {
    await navigate("Dependencies")
    await header.getByRole("tab", { name: "Configuration", exact: true }).click()
    await expect(header.getByRole("tab", { name: "Configuration", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await navigate("Tests")
    await expect(header.getByRole("tab", { name: "Unit", exact: true })).toBeVisible()
    await expect(header.getByRole("tab", { name: "Configuration", exact: true })).toHaveCount(0)
    await header.getByRole("tab", { name: "Playwright", exact: true }).click()
    await expect(header.getByRole("tab", { name: "Screenshots", exact: true })).toBeVisible()
  })
})

test("공용 헤더의 저장 버튼은 본문 설정 폼의 변경값을 저장하고 다시 읽는다", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  const endpoint = `/api/projects/${project.id}/configuration`
  const original = await (await request.get(endpoint)).json()
  const settings = JSON.parse(original.source)
  const timeout = String((settings.tests?.timeoutMs ?? 10000) + 123)
  try {
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    const header = page.locator(".app-header:visible")
    const navigation = page.getByRole("button", { name: "Project settings", exact: true })
    if (!(await isOnScreen(navigation))) {
      await header.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await navigation.click()
    await page.keyboard.press("Escape")
    const save = header.getByRole("button", { name: "Save settings", exact: true })
    const field = page.locator('input[name="tests.timeoutMs"]')
    await expect(field).toBeVisible()
    await expect(save).toBeDisabled()
    await field.fill(timeout)
    await expect(save).toBeEnabled()
    const saved = page.waitForResponse(
      (value) => value.url().endsWith(endpoint) && value.request().method() === "PUT",
    )
    await save.click()
    expect((await saved).ok(), "헤더의 버튼이 연결된 본문 폼을 전송한다").toBeTruthy()
    await expect(save).toBeDisabled()
    const persisted = await (await request.get(endpoint)).json()
    expect(JSON.parse(persisted.source).tests.timeoutMs, "서버에서 변경값을 다시 읽는다").toBe(
      Number(timeout),
    )
    await page.reload()
    await expect(field).toHaveValue(timeout)
  } finally {
    const current = await (await request.get(endpoint)).json()
    expect(
      (
        await request.put(endpoint, {
          data: { source: original.source, revision: current.revision },
        })
      ).ok(),
      "격리 앱의 원래 설정을 복원한다",
    ).toBeTruthy()
  }
})
