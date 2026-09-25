import { test } from "@playwright/test"
import { openMcpEnvironment } from "../mcp-app"

test("MCP 환경 카드의 고정 의존성을 검토한다", async ({ page, request }, info) => {
  const restore = await openMcpEnvironment(page, request)
  try {
    await page.evaluate(() => document.fonts.ready)
    await info.attach("MCP Apps / 환경 / 고정 의존성", {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  } finally {
    await restore()
  }
})
