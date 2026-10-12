import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 에이전트 설치 응답 경계만 고정하고 실제 설정 화면과 컨트롤을 사용한다.
test("새 플러그인 버전을 확인하고 승인 후 업데이트 결과를 표시한다", async ({ page, request }) => {
  expect(
    (
      await request.post("/api/projects", {
        data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
      })
    ).ok(),
  ).toBeTruthy()
  const state = {
    agents: [
      {
        agent: "codex",
        currentVersion: "0.1.0",
        latestVersion: null as string | null,
        status: "unchecked",
        error: null as string | null,
      },
      {
        agent: "claude",
        currentVersion: null,
        latestVersion: null,
        status: "missing",
        error: null,
      },
    ],
    busy: false,
    checkedAt: null as string | null,
  }
  let installs = 0
  await page.route("**/api/plugin-updates", (route) => route.fulfill({ json: state }))
  await page.route("**/api/plugin-updates/check", (route) => {
    Object.assign(state.agents[0], { latestVersion: "0.2.0", status: "available", error: null })
    return route.fulfill({ json: state })
  })
  await page.route("**/api/plugin-updates/install", (route) => {
    expect(route.request().postDataJSON()).toEqual({ agent: "codex", version: "0.2.0" })
    installs++
    if (installs === 1) {
      Object.assign(state.agents[0], { status: "error", error: "CLI update failed" })
    } else {
      Object.assign(state.agents[0], { status: "updated", currentVersion: "0.2.0", error: null })
    }
    return route.fulfill({ json: state })
  })
  await openApp(page, "en")
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.keyboard.press("Escape")
  }
  const section = page.getByRole("region", { name: "Agent plugins", exact: true })
  await test.step("확인은 새 버전을 보여주지만 자동으로 설치하지 않는다", async () => {
    await section.getByRole("button", { name: "Check plugin updates" }).click()
    await expect(section.getByText("Available: 0.2.0", { exact: true })).toBeVisible()
    await expect(section.getByText("Not installed", { exact: true })).toBeVisible()
    expect(installs).toBe(0)
  })
  await test.step("업데이트 확인을 취소하면 설치하지 않는다", async () => {
    await section.getByRole("button", { name: "Update Codex plugin" }).click()
    const dialog = page.getByRole("dialog", { name: "Update Codex plugin" })
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    expect(installs).toBe(0)
  })
  await test.step("설치 실패를 표시하고 재확인 후 재시도할 수 있다", async () => {
    await section.getByRole("button", { name: "Update Codex plugin" }).click()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Update plugin", exact: true })
      .click()
    await expect(section.getByRole("alert")).toContainText("CLI update failed")
    await section.getByRole("button", { name: "Check plugin updates" }).click()
    await section.getByRole("button", { name: "Update Codex plugin" }).click()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Update plugin", exact: true })
      .click()
    await expect(section.getByText("Updated. Start a new agent session.")).toBeVisible()
    expect(installs).toBe(2)
    await expect(section.getByRole("button", { name: "Update Codex plugin" })).toHaveCount(0)
  })
  await test.step("CLI 절대 경로를 저장하고 새로고침 뒤 다시 읽는다", async () => {
    const codex = page.getByRole("textbox", { name: "Codex CLI path", exact: true })
    await codex.fill("/missing/codex")
    await page
      .getByRole("textbox", { name: "Claude Code CLI path", exact: true })
      .fill("/missing/claude")
    await page.getByRole("button", { name: "Save settings", exact: true }).click()
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible()
    const settings = await request.get("/api/instance/settings")
    expect((await settings.json()).value.agents).toEqual({
      codex: { cliPath: "/missing/codex" },
      claude: { cliPath: "/missing/claude" },
    })
    await page.reload()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
    await expect(codex).toHaveValue("/missing/codex")
  })
})
