import { expect, test } from "@playwright/test"
import { openApp } from "../app"

for (const width of [1280, 390]) {
  test(`${width}px에서 프로젝트를 검색하고 이름 변경·연결 해제·재연결한다`, async ({
    page,
    request,
  }) => {
    const original = `Managed ${width}`
    const renamed = `Renamed ${width}`
    const response = await request.post("/api/projects", {
      data: { path: width === 1280 ? "/app/e2e" : "/app/ui-tests", name: original },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
    await openApp(page, "en")
    await test.step("프로젝트 메뉴에서 관리 화면을 연다", async () => {
      if (width < 768) {
        await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
      }
      await page.getByRole("button", { name: original, exact: true }).click()
      await page.getByRole("menuitem", { name: "Manage projects", exact: true }).click()
      await expect(
        page.getByRole("heading", { name: "Manage projects", exact: true }),
      ).toBeVisible()
    })
    const management = page.getByRole("dialog", { name: "Manage projects", exact: true })
    const search = management.getByRole("textbox", { name: "Search projects", exact: true })
    await test.step("검색한 프로젝트 이름을 수정한다", async () => {
      await search.fill(original)
      await management.getByRole("button", { name: `Actions for ${original}`, exact: true }).click()
      await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
      const dialog = page.getByRole("dialog", { name: "Rename project", exact: true })
      await dialog.getByRole("textbox", { name: "Project name", exact: true }).fill(renamed)
      await dialog.getByRole("button", { name: "Save", exact: true }).click()
      await search.fill(renamed)
      await expect(management.getByText(renamed, { exact: true })).toBeVisible()
      expect((await (await request.get(`/api/projects/${project.id}`)).json()).name).toBe(renamed)
    })
    await test.step("취소는 연결을 유지하고 확인하면 해제 목록으로 이동한다", async () => {
      await management.getByRole("button", { name: `Actions for ${renamed}`, exact: true }).click()
      await page.getByRole("menuitem", { name: "Disconnect", exact: true }).click()
      const confirm = page.getByRole("alertdialog", { name: "Disconnect project?", exact: true })
      await confirm.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(management.getByText(renamed, { exact: true })).toBeVisible()
      await management.getByRole("button", { name: `Actions for ${renamed}`, exact: true }).click()
      await page.getByRole("menuitem", { name: "Disconnect", exact: true }).click()
      await confirm.getByRole("button", { name: "Disconnect", exact: true }).click()
      await expect(management.getByText(renamed, { exact: true })).toHaveCount(0)
      await management.getByRole("tab", { name: "Disconnected", exact: true }).click()
      await expect(management.getByText(renamed, { exact: true })).toBeVisible()
    })
    await test.step("재연결하면 이전 이름과 식별자를 유지한다", async () => {
      await management.getByRole("button", { name: "Reconnect", exact: true }).click()
      await management.getByRole("tab", { name: "Connected", exact: true }).click()
      await expect(management.getByText(renamed, { exact: true })).toBeVisible()
      const persisted = await (await request.get(`/api/projects/${project.id}`)).json()
      expect(persisted.disconnectedAt).toBeUndefined()
      expect(persisted.name).toBe(renamed)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
    await test.step("폴더 선택 후 표시 이름을 검증하고 새 프로젝트를 연결한다", async () => {
      // 운영체제 선택기 결과만 대체하며 연결과 저장은 실제 앱 API를 사용한다.
      await page.route("**/api/dialogs/directory", (route) =>
        route.fulfill({ json: { path: width === 1280 ? "/app/app/server" : "/app/app/web" } }),
      )
      await management.getByRole("button", { name: "Connect project", exact: true }).click()
      const form = page.getByRole("dialog", { name: "Connect project", exact: true })
      await form.getByRole("textbox", { name: "Project name", exact: true }).fill("  ")
      await expect(form.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
      const created = `Created ${width}`
      await form.getByRole("textbox", { name: "Project name", exact: true }).fill(created)
      await form.getByRole("button", { name: "Save", exact: true }).click()
      await search.fill(created)
      await expect(management.getByText(created, { exact: true })).toBeVisible()
      const saved = await (await request.get("/api/projects")).json()
      expect(saved.some((item: { name: string }) => item.name === created)).toBe(true)
    })
  })
}
