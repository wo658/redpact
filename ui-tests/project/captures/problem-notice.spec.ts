import { expect, test } from "@playwright/test"

test("설정 검증 오류의 공통 Notice Handoff shell을 검토한다", async ({ page, request }, info) => {
  const response = await request.post("/api/projects", {
    data: { path: "/app", name: "Problem notice capture fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id: string) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "ko")
  }, project.id)
  await page.goto("/")
  const mobile = (page.viewportSize()?.width ?? 1920) < 768
  if (mobile) {
    await page.locator("#root").getByRole("button", { name: "사이드바 전환", exact: true }).click()
  }
  await page.getByRole("button", { name: "Project settings", exact: true }).click()
  if (mobile) {
    await page.keyboard.press("Escape")
  }
  const service = page.locator('input[name="playwright.service"]')
  await expect(service).toHaveValue("app")
  await service.fill("")
  await page.getByRole("button", { name: "설정 저장", exact: true }).click()
  const shell = page
    .getByRole("heading", { name: "문제 상세", exact: true })
    .locator("..")
    .locator("..")
  await expect(shell.getByRole("alert")).toBeVisible()
  await shell.scrollIntoViewIfNeeded()
  await page.evaluate(() => document.fonts.ready)
  await info.attach("문제 상황 / 공통 Notice / Handoff와 진단", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
})
