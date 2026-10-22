import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/projects", {
    data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
  })
  expect(response.ok(), "실제 앱 프로젝트를 연결한다").toBeTruthy()
})

// 실제 앱에서 업데이트 API 응답만 대체하여 연결 실패와 복구를 검증한다.
test("업데이트 조회 실패는 버튼을 숨기고 복구된 새 버전을 다시 표시한다", async ({ page }) => {
  let fail = false
  await page.route("**/api/updates", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
      : route.fulfill({ json: { version: "9.0.0", busy: false } }),
  )
  const update = page.getByRole("button", { name: "Update to 9.0.0", exact: true })
  await test.step("조회한 새 버전을 사이드바에 표시한다", async () => {
    await openApp(page, "en")
    await expect(page.locator(".app-header:visible")).toBeVisible()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await expect(update).toBeVisible()
  })
  await test.step("업데이트 조회가 실패하면 버튼을 숨긴다", async () => {
    fail = true
    await expect(update).toHaveCount(0, { timeout: 10000 })
  })
  await test.step("조회가 복구되면 새 버전 버튼을 다시 표시한다", async () => {
    fail = false
    await expect(update).toBeVisible({ timeout: 10000 })
  })
})

test("npm도 설정에서 확인하고 Update 확인 후 설치하며 보류 오류를 표시한다", async ({ page }) => {
  const state = {
    currentVersion: "0.2.0",
    version: null as string | null,
    busy: false,
    supported: true,
    canInstall: true,
    error: null,
    installError: null as string | null,
  }
  let installs = 0
  await page.route("**/api/updates", (route) => route.fulfill({ json: state }))
  await page.route("**/api/updates/check", (route) => {
    state.version = "9.0.0"
    return route.fulfill({ json: state })
  })
  await page.route("**/api/updates/install", (route) => {
    installs++
    expect(route.request().postDataJSON()).toEqual({ version: "9.0.0" })
    if (installs === 1) {
      state.installError = "Active work deferred the update"
    } else {
      state.installError = null
      state.currentVersion = "9.0.0"
      state.version = null
    }
    return route.fulfill({ json: { accepted: true } })
  })
  await openApp(page, "en")
  await expect(page.locator(".app-header:visible")).toBeVisible()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await test.step("npm 최신 상태에서는 사이드바 업데이트가 숨겨진다", async () => {
    await expect(
      page
        .getByRole("group", { name: "App shortcuts" })
        .getByRole("button", { name: /Update|Check for updates/ }),
    ).toHaveCount(0)
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
    await page.getByRole("button", { name: "Check for updates", exact: true }).click()
    await expect(page.getByText("Current version: 0.2.0")).toBeVisible()
    expect(installs).toBe(0)
  })
  await test.step("Update를 눌러도 확인 전에는 설치하지 않는다", async () => {
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    const update = page.getByRole("button", { name: "Update to 9.0.0", exact: true })
    await expect(update).toHaveText("Update", { timeout: 10000 })
    await update.click()
    await expect(
      page
        .getByRole("dialog")
        .filter({ has: page.getByRole("button", { name: "Install and restart", exact: true }) }),
    ).toBeVisible()
    expect(installs).toBe(0)
  })
  await test.step("설치 확인 후 작업 보류 이유를 보여주고 재시도를 허용한다", async () => {
    await page.getByRole("button", { name: "Install and restart", exact: true }).click()
    await expect(
      page
        .getByRole("dialog")
        .filter({ has: page.getByRole("button", { name: "Install and restart", exact: true }) })
        .getByRole("alert"),
    ).toHaveText("Active work deferred the update", { timeout: 10000 })
    await expect(
      page.getByRole("button", { name: "Install and restart", exact: true }),
    ).toBeEnabled()
    expect(installs).toBe(1)
  })
  await test.step("재시작된 서버의 버전을 확인한 뒤 페이지를 다시 불러온다", async () => {
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Install and restart", exact: true }).click(),
    ])
    expect(installs).toBe(2)
    await expect(page.getByRole("button", { name: "Update to 9.0.0", exact: true })).toHaveCount(0)
  })
})

test("확인 실패를 최신 상태로 알리지 않고 npm 자동 설치 불가 사유를 안내한다", async ({ page }) => {
  const state = {
    currentVersion: "0.2.0",
    version: "9.0.0",
    busy: false,
    supported: true,
    canInstall: false,
    error: null,
  }
  await page.route("**/api/updates", (route) => route.fulfill({ json: state }))
  await page.route("**/api/updates/check", (route) =>
    route.fulfill({ json: { ...state, error: "npm registry returned HTTP 404" } }),
  )
  await openApp(page, "en")
  await expect(page.locator(".app-header:visible")).toBeVisible()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await test.step("불명확한 설치를 전역 npm 설치로 바꾸지 않는다", async () => {
    await page.getByRole("button", { name: "Update to 9.0.0", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "Update to 9.0.0", exact: true })).toContainText(
      "Automatic installation is unavailable",
    )
    await expect(
      page.getByRole("button", { name: "Install and restart", exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole("dialog", { name: "Update to 9.0.0", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click()
  })
  await test.step("수동 확인 실패를 오류로 표시한다", async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
    await page.getByRole("button", { name: "Check for updates", exact: true }).click()
    await expect(page.getByRole("alert")).toContainText("npm registry returned HTTP 404")
    await expect(page.getByText("Redpact is up to date.", { exact: true })).toHaveCount(0)
  })
})
