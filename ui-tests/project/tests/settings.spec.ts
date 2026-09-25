import { expect, type Locator, test } from "@playwright/test"
import { openApp } from "../app.js"

async function expectSwitchColors(toggle: Locator, checked: boolean) {
  await expect(toggle).toHaveAttribute("aria-checked", String(checked))
  await expect
    .poll(
      () =>
        toggle.evaluate((element, enabled) => {
          const probe = document.createElement("span")
          element.append(probe)
          const resolved = (token: string) => {
            probe.style.backgroundColor = `var(--${token})`
            return getComputedStyle(probe).backgroundColor
          }
          const track = resolved(enabled ? "primary" : "input")
          const thumb = resolved(enabled ? "primary-foreground" : "background")
          const actualTrack = getComputedStyle(element).backgroundColor
          const actualThumb = getComputedStyle(
            element.querySelector('[data-slot="switch-thumb"]')!,
          ).backgroundColor
          probe.remove()
          return actualTrack === track && actualThumb === thumb && track !== thumb
        }, checked),
      { message: "스위치 트랙과 손잡이는 현재 테마의 의미 색상으로 구분된다" },
    )
    .toBe(true)
}

test("선택한 테마는 새로고침 후에도 유지된다", async ({ page, request }) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  await openApp(page)
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await expect(
    page.getByRole("spinbutton", { name: "관리 환경 동시 실행 수", exact: true }),
  ).toBeVisible()
  const toggle = page.getByRole("switch", { name: "자동 줄바꿈", exact: true })
  for (const theme of ["라이트", "다크"]) {
    await test.step(`${theme} 테마에서 스위치를 켜고 끄며 색상을 확인한다`, async () => {
      await page.getByRole("combobox", { name: "테마", exact: true }).click()
      await page.getByRole("option", { name: theme, exact: true }).click()
      await expectSwitchColors(toggle, true)
      await toggle.click()
      await expectSwitchColors(toggle, false)
      await toggle.focus()
      await page.keyboard.press("Space")
      await expectSwitchColors(toggle, true)
    })
  }
  await test.step("전역 설정에서 다크 테마를 선택한다", async () => {
    await page.getByRole("combobox", { name: "테마", exact: true }).click()
    await page.getByRole("option", { name: "다크", exact: true }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
  })
  await test.step("새로고침 뒤에도 다크 테마 선택이 유지된다", async () => {
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "테마", exact: true })).toHaveValue("다크")
  })
})

test("dependency 도움말은 필요할 때 열고 닫을 수 있다", async ({ page, request }) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  await openApp(page)
  await page.getByRole("button", { name: "Dependencies", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "고정 의존성과 환경변수", exact: true })
  await expect(dialog).toBeHidden()
  await page.getByRole("button", { name: "고정 의존성 및 환경변수 도움말" }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "닫기", exact: true }).click()
  await expect(dialog).toBeHidden()
})
