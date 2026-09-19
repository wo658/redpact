import { expect, test } from "@playwright/test"
import {
  assertWrapped,
  openNavigation,
  openWrapDiff,
  openWrapSource,
  prepareWrapProject,
} from "../word-wrap"

test("긴 diff를 줄바꿈하고 원문과 줄 번호를 보존하며 선택을 기억한다", async ({
  page,
  request,
}) => {
  const restore = await prepareWrapProject(page, request)
  try {
    await test.step("실제 설정 파일 변경의 긴 코드와 URL을 연다", async () => {
      await openWrapDiff(page)
    })
    const toggle = page.getByRole("switch", { name: "Word wrap", exact: true })
    const cells = page.locator(".diff-code")
    const original = await cells.allTextContents()
    const gutters = await page.locator(".diff-gutter").allTextContents()
    await test.step("자동 줄바꿈으로 긴 행을 끝까지 표시한다", async () => {
      await expect(page.getByRole("button", { name: "Word wrap", exact: true })).toHaveCount(0)
      await assertWrapped(page)
    })
    await test.step("키보드로 줄바꿈을 끄면 가로 스크롤로 전체 행에 접근한다", async () => {
      await openNavigation(page, "Settings")
      await expect(toggle).toHaveAttribute("aria-checked", "true")
      await toggle.focus()
      await page.keyboard.press("Space")
      await expect(toggle).toHaveAttribute("aria-checked", "false")
      await openWrapDiff(page)
      const cell = cells.filter({ hasText: "END_URL" })
      await expect(cell).toHaveCSS("white-space", "pre")
      const scroll = page.locator(".diff").locator("..")
      expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true,
      )
      await scroll.evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      expect(await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
      expect(await cells.allTextContents()).toEqual(original)
      expect(await page.locator(".diff-gutter").allTextContents()).toEqual(gutters)
    })
    await test.step("다시 켜도 원문과 줄 번호가 유지되고 새로 열어도 선택을 기억한다", async () => {
      await openNavigation(page, "Settings")
      await toggle.click()
      await openWrapDiff(page)
      await assertWrapped(page)
      expect(await cells.allTextContents()).toEqual(original)
      expect(await page.locator(".diff-gutter").allTextContents()).toEqual(gutters)
      await openNavigation(page, "Settings")
      await toggle.click()
      await openWrapDiff(page)
      await expect(page.locator(".diff")).not.toHaveClass(/diff-wrap/)
      await openNavigation(page, "Settings")
      await toggle.click()
      await openWrapDiff(page)
      await assertWrapped(page)
    })
    await test.step("파일 보기에도 같은 줄바꿈 선택과 원문을 적용한다", async () => {
      await openWrapSource(page)
      await assertWrapped(page)
      await expect(page.locator(".diff-code-insert, .diff-code-delete")).toHaveCount(0)
      await expect(page.locator(".diff-code .token").first()).toBeVisible()
    })
  } finally {
    await restore()
  }
})

test("저장소 쓰기가 차단되어도 줄바꿈 선택을 화면 전환 동안 유지한다", async ({
  page,
  request,
}) => {
  const restore = await prepareWrapProject(page, request)
  await page.addInitScript(() => {
    localStorage.setItem("redpact:word-wrap", "false")
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === "redpact:word-wrap") {
        throw new DOMException("Blocked", "QuotaExceededError")
      }
      return setItem.call(this, key, value)
    }
  })
  try {
    await openWrapDiff(page)
    const toggle = page.getByRole("switch", { name: "Word wrap", exact: true })
    await openNavigation(page, "Settings")
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await toggle.click()
    await openWrapSource(page, false)
    await assertWrapped(page)
    await openNavigation(page, "Settings")
    await expect(toggle).toHaveAttribute("aria-checked", "true")
  } finally {
    await restore()
  }
})
