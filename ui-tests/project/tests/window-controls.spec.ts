import { expect, test } from "@playwright/test"
import { openApp } from "../app"

// 실제 앱의 Tauri IPC 경계만 대체한다. OS 창 동작 검증과 구분한다.
test("Windows 창 버튼은 IPC를 호출하고 외부 최대화와 실패 후 재시도를 반영한다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { maximized: false, fail: false, calls: [] as string[] }
    Object.assign(window, {
      windowFixture: state,
      __TAURI__: {
        window: {
          getCurrentWindow: () => ({
            isMaximized: async () => state.maximized,
            minimize: async () => {
              if (state.fail) {
                throw new Error("IPC unavailable")
              }
              state.calls.push("minimize")
            },
            toggleMaximize: async () => {
              state.calls.push("toggleMaximize")
              state.maximized = !state.maximized
            },
            close: async () => {
              state.calls.push("close")
            },
          }),
        },
      },
    })
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        document.documentElement.dataset.desktop = "windows"
      },
      { once: true },
    )
  })
  await openApp(page, "en")
  await page.getByRole("button", { name: "Minimize window", exact: true }).click()
  await page.getByRole("button", { name: "Maximize window", exact: true }).click()
  await page.getByRole("button", { name: "Restore window", exact: true }).click()
  await page.getByRole("button", { name: "Close window", exact: true }).click()
  const calls = await page.evaluate(
    () => (window as unknown as { windowFixture: { calls: string[] } }).windowFixture.calls,
  )
  expect(calls).toEqual(["minimize", "toggleMaximize", "toggleMaximize", "close"])
  await page.evaluate(() => {
    const state = (window as unknown as { windowFixture: { maximized: boolean; fail: boolean } })
      .windowFixture
    state.maximized = true
    state.fail = true
    window.dispatchEvent(new Event("resize"))
  })
  await expect(page.getByRole("button", { name: "Restore window", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Minimize window", exact: true }).click()
  await expect(page.getByText("Could not control the window.", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Minimize window", exact: true })).toBeEnabled()
  await page.evaluate(() => {
    ;(window as unknown as { windowFixture: { fail: boolean } }).windowFixture.fail = false
  })
  await page.getByRole("button", { name: "Minimize window", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { windowFixture: { calls: string[] } }).windowFixture.calls.length,
      ),
    )
    .toBe(5)
})
