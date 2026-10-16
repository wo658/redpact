import { test } from "@playwright/test"
import { openExecutionScope } from "../execution-scope-fixture"

test("실행 범위와 선택 파일을 검토한다", async ({ page }, testInfo) => {
  await test.step("실제 앱에 기록된 변경 범위 결과를 연다", () => openExecutionScope(page))
  await test.step("현재 실행 크기의 범위·파일 증거를 기록한다", async () => {
    await testInfo.attach("Execution Review / 실행 범위 / 변경 파일", {
      body: await page.screenshot({ fullPage: true, scale: "css" }),
      contentType: "image/png",
    })
  })
})
