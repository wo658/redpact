import { expect, test } from "@playwright/test"
import { openApp } from "../app"

test("헤더에서 새 탭을 열고 전환하고 닫아도 기존 작업공간을 유지한다", async ({
  page,
  request,
}) => {
  const connected = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(connected.ok(), "실제 앱 프로젝트 연결이 성공한다").toBeTruthy()
  await openApp(page, "ko")
  const tabs = page.getByRole("tablist", { name: "열린 작업공간", exact: true })
  await expect(tabs.getByRole("tab")).toHaveCount(1)
  const original = await tabs.getByRole("tab").innerText()
  const add = page.getByRole("button", { name: "새 탭", exact: true })
  await test.step("새 탭 버튼으로 독립된 프로젝트 탭을 연다", async () => {
    await expect(add).toBeVisible()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "사이드바 전환", exact: true }).click()
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
    await add.click()
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeHidden()
    await expect(tabs.getByRole("tab")).toHaveCount(2)
    await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true")
    await expect(tabs.getByRole("tab").first()).toHaveText(original)
    await tabs.getByRole("tab").first().click()
    await expect(tabs.getByRole("tab").first()).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()
  })
  await test.step("여러 탭에서도 새 탭과 선택된 탭에 접근한다", async () => {
    for (let index = 0; index < 6; index++) {
      await add.click()
    }
    await expect(tabs.getByRole("tab")).toHaveCount(8)
    await expect(tabs.getByRole("tab").last()).toBeInViewport()
    await expect(add).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 1920,
    )
  })
  await test.step("선택된 탭을 닫으면 이웃 탭으로 돌아간다", async () => {
    await tabs
      .getByRole("button", { name: `${original} 닫기`, exact: true })
      .last()
      .click()
    await expect(tabs.getByRole("tab")).toHaveCount(7)
    await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true")
    await expect(tabs.getByRole("tab").last()).toBeInViewport()
  })
})
