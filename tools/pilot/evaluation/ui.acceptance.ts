import assert from "node:assert/strict"
import { isAbsolute, join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const root = process.env.PILOT_CHECKOUT
assert.ok(root && isAbsolute(root), "PILOT_CHECKOUT must be an absolute fixture root")
const { createApp } = await import(pathToFileURL(join(root, "src/server.ts")).href)
const { chromium } = await import(process.env.PILOT_PLAYWRIGHT_MODULE ?? "playwright")

async function withPage(width: number, height: number, run: (page: any) => Promise<void>) {
  const server = createApp()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  let browser: any
  try {
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width, height } })
    page.setDefaultTimeout(2000)
    await page.goto(`http://127.0.0.1:${address.port}`)
    await page.locator("#orders tr").nth(2).waitFor()
    await run(page)
  } finally {
    await browser?.close()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    )
  }
}
for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`UI: ${width} 화면에서 필터 적용과 초기화 및 빈 결과를 처리한다`, async () => {
    await withPage(width, height, async (page) => {
      const input = page.getByRole("spinbutton")
      assert.equal(await input.count(), 1, "최소 수량 입력이 필요하다")
      await input.fill("2")
      await page.getByRole("button", { name: /^apply$/i }).click()
      await page.waitForFunction(() => document.querySelectorAll("#orders tr").length === 2)
      assert.deepEqual(await page.locator("#orders tr td:nth-child(2)").allTextContents(), [
        "2",
        "3",
      ])
      await page.getByRole("button", { name: /^reset$/i }).click()
      await page.waitForFunction(() => document.querySelectorAll("#orders tr").length === 3)
      assert.equal(await input.inputValue(), "", "초기화는 입력도 비운다")
      await input.fill("99")
      await page.getByRole("button", { name: /^apply$/i }).focus()
      await page.keyboard.press("Enter")
      await page.waitForFunction(() => document.querySelectorAll("#orders tr").length === 0)
      assert.match(await page.getByRole("status").innerText(), /no orders|no results|0 orders/i)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
    })
  })
}
test("UI: 목록 요청 실패를 알리고 다시 시도하면 복구한다", async () => {
  await withPage(390, 844, async (page) => {
    await page.route("**/orders", (route: any) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"Unavailable"}',
      }),
    )
    await page.reload()
    await page.waitForTimeout(100)
    const retry = page.getByRole("button", { name: /retry|try again/i })
    assert.equal(await retry.count(), 1, "실패 후 재시도 버튼이 필요하다")
    assert.match(await page.getByRole("status").innerText(), /error|unable|could not|failed/i)
    await page.unroute("**/orders")
    await retry.click()
    await page.locator("#orders tr").nth(2).waitFor()
    assert.equal(await page.locator("#orders tr").count(), 3)
  })
})
