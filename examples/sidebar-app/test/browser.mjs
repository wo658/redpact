import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const browser = await chromium.launch({ headless: true })
const output = new URL("../dist/evidence/", import.meta.url)
await mkdir(output, { recursive: true })
try {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport })
    await page.goto("http://127.0.0.1:4319")
    const app = page.frameLocator("iframe")
    await app.getByText("Connected to local MCP", { exact: true }).waitFor()
    await app.getByRole("button", { name: "Reset", exact: true }).click()
    await app.locator("#count").filter({ hasText: /^0$/ }).waitFor()
    await app.getByRole("button", { name: "Increment", exact: true }).click()
    await app.locator("#count").filter({ hasText: /^1$/ }).waitFor()
    await page.reload()
    await app.locator("#count").filter({ hasText: /^1$/ }).waitFor()
    await app.getByRole("button", { name: "Refresh", exact: true }).click()
    await app.getByText("Connected to local MCP", { exact: true }).waitFor()
    const overflow = await app
      .locator("body")
      .evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    assert.equal(overflow, false, "모바일과 데스크톱에서 가로 넘침이 없어야 한다")
    await page.screenshot({
      path: new URL(`${viewport.width}-light.png`, output).pathname,
      fullPage: true,
    })
    await page.getByRole("button", { name: "Dark theme" }).click()
    await app.locator('html[data-theme="dark"]').waitFor()
    await page.screenshot({
      path: new URL(`${viewport.width}-dark.png`, output).pathname,
      fullPage: true,
    })
    await page.route("**/tool", (route) => route.fulfill({ status: 503, body: "unavailable" }))
    await app.getByRole("button", { name: "Refresh", exact: true }).click()
    await app.getByText("Request failed", { exact: true }).waitFor()
    assert.match(
      await app.getByRole("alert").innerText(),
      /unavailable/i,
      "연결 오류를 사용자에게 보여야 한다",
    )
    await page.unroute("**/tool")
    await app.getByRole("button", { name: "Refresh", exact: true }).click()
    await app.getByText("Connected to local MCP", { exact: true }).waitFor()
    await page.close()
    console.log(`PASS ${viewport.width}: 증가·초기화·새로고침·상태 유지·테마·오류 복구`)
  }
} finally {
  await browser.close()
}
