import { expect, test } from "@playwright/test"
import { openNavigation, prepareWrapProject } from "../word-wrap"

test("전역 설정에서 자동 줄바꿈 스위치를 확인한다", async ({ page, request }, info) => {
  const restore = await prepareWrapProject(page, request)
  try {
    await page.goto("/")
    await openNavigation(page, "Settings")
    const toggle = page.getByRole("switch", { name: "Word wrap", exact: true })
    for (const viewport of [
      { name: "데스크톱", width: 1440, height: 1000 },
      { name: "모바일", width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      for (const theme of [
        { value: "Light", name: "라이트" },
        { value: "Dark", name: "다크" },
      ]) {
        await page.getByRole("combobox", { name: "Theme", exact: true }).click()
        await page.getByRole("option", { name: theme.value, exact: true }).click()
        for (const checked of [true, false]) {
          if ((await toggle.getAttribute("aria-checked")) !== String(checked)) {
            await toggle.click()
          }
          await expect(toggle).toHaveAttribute("aria-checked", String(checked))
          await toggle.scrollIntoViewIfNeeded()
          await page.evaluate(() => document.fonts.ready)
          await info.attach(
            `전역 설정 / ${viewport.name} ${theme.name} / 자동 줄바꿈 ${checked ? "켜짐" : "꺼짐"}`,
            {
              body: await page.screenshot({ animations: "disabled", scale: "css" }),
              contentType: "image/png",
            },
          )
        }
      }
    }
  } finally {
    await restore()
  }
})
