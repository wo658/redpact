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

// 실제 앱의 native IPC 경계 fixture이며 OS 설치 검증은 별도로 수행한다.
test("새 버전만 Update를 표시하고 수동 확인은 설정에서 실행한다", async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      version: null as string | null,
      busy: false,
      calls: [] as string[],
      fail: false,
    }
    Object.assign(window, {
      updateFixture: state,
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (state.fail && command === "desktop_update_status") {
              throw new Error("Native unavailable")
            }
            state.calls.push(command)
            if (command === "desktop_check_update") {
              state.version = "9.0.0"
            }
            if (command === "desktop_install_update") {
              state.busy = true
            }
            return { ...state }
          },
        },
      },
    })
  })
  await openApp(page, "en")
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await test.step("최신 상태의 사이드바에는 업데이트나 수동 확인이 없다", async () => {
    const group = page.getByRole("group", { name: "App shortcuts" })
    await expect(group.getByRole("button", { name: /Update|Check for updates/ })).toHaveCount(0)
    await group.getByRole("button", { name: "Settings", exact: true }).click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
  })
  await test.step("설정에서 새 버전을 확인해도 설치를 시작하지 않는다", async () => {
    await page.getByRole("button", { name: "Check for updates", exact: true }).click()
    expect(
      await page.evaluate(
        () => (window as unknown as { updateFixture: { calls: string[] } }).updateFixture.calls,
      ),
    ).not.toContain("desktop_install_update")
  })
  await test.step("새 버전의 Update 버튼은 설치 요청 후 중복 실행을 막는다", async () => {
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    const update = page
      .getByRole("group", { name: "App shortcuts" })
      .getByRole("button", { name: "Update to 9.0.0", exact: true })
    await expect(update).toBeVisible({ timeout: 10000 })
    await expect(update).toHaveText("Update")
    await update.click()
    await expect(update).toBeDisabled()
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { busy: boolean } }).updateFixture.busy = false
    })
    await expect(update).toBeEnabled({ timeout: 10000 })
  })
  await test.step("연결 실패 시 버튼을 숨기고 복구 후 새 버전 상태를 다시 반영한다", async () => {
    const update = page.getByRole("button", { name: "Update to 9.0.0", exact: true })
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { fail: boolean } }).updateFixture.fail = true
    })
    await expect(update).toHaveCount(0, { timeout: 10000 })
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { fail: boolean } }).updateFixture.fail = false
    })
    await expect(update).toBeVisible({ timeout: 10000 })
    await page.evaluate(() => {
      ;(window as unknown as { updateFixture: { version: string | null } }).updateFixture.version =
        null
    })
    await expect(update).toHaveCount(0, { timeout: 10000 })
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
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
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
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
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
