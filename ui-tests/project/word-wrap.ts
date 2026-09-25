import { type APIRequestContext, expect, type Page } from "@playwright/test"

export async function prepareWrapProject(page: Page, request: APIRequestContext) {
  const response = await request.post("/api/projects", {
    data: { path: "/app", name: "Redpact" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  const endpoint = `/api/projects/${project.id}/configuration`
  const read = await request.get(endpoint)
  expect(read.ok()).toBeTruthy()
  const original = await read.json()
  const settings = JSON.parse(original.source)
  settings.tests.env = {
    ...settings.tests.env,
    WRAP_PROSE: `${"Long lines preserve spaces and indentation while wrapping for review. ".repeat(18)}END_PROSE`,
    WRAP_URL: `https://example.invalid/${"abcdefghij".repeat(150)}END_URL`,
    WRAP_KOREAN: `${"긴문장줄바꿈확인 ".repeat(80)}END_KOREAN`,
  }
  const saved = await request.put(endpoint, {
    data: { revision: original.revision, source: JSON.stringify(settings, null, 2) },
  })
  expect(saved.ok()).toBeTruthy()
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.id)
  return async () => {
    const current = await (await request.get(endpoint)).json()
    const restored = await request.put(endpoint, {
      data: { revision: current.revision, source: original.source },
    })
    expect(restored.ok()).toBeTruthy()
  }
}

export async function openWrapDiff(page: Page) {
  await page.goto("/")
  const navigation = page.getByRole("navigation", { name: "Worktrees", exact: true })
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await expect(navigation).toBeVisible()
  await navigation.getByRole("button").first().click()
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "Diff", exact: true }).click()
  await page.getByRole("treeitem", { name: "settings.json", exact: true }).click()
  await expect(page.locator(".diff-code").filter({ hasText: "END_PROSE" })).toBeVisible()
}

export async function openNavigation(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true })
  if (!(await button.isVisible())) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await button.click()
  await page.keyboard.press("Escape")
}

export async function openWrapSource(page: Page, reload = true) {
  if (reload) {
    await page.goto("/")
  }
  await openNavigation(page, "File Viewer")
  await page.getByRole("treeitem", { name: ".redpact", exact: true }).click()
  await page.getByRole("treeitem", { name: "settings.json", exact: true }).click()
  await expect(page.locator(".diff-source .diff-code").filter({ hasText: "END_URL" })).toBeVisible()
}

export async function assertWrapped(page: Page) {
  const cells = page.locator(".diff-code")
  for (const marker of ["END_PROSE", "END_URL", "END_KOREAN"]) {
    const cell = cells.filter({ hasText: marker })
    await expect(cell).toHaveCount(1)
    const geometry = await cell.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(geometry.height, `${marker}: 한 소스 행이 여러 화면 줄에 표시된다`).toBeGreaterThan(
      geometry.lineHeight * 2,
    )
    expect(
      geometry.scrollWidth,
      `${marker}: 긴 문자열도 셀 너비 안에 표시된다`,
    ).toBeLessThanOrEqual(geometry.width + 1)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  )
}
