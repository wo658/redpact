import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

test("실제 서버가 업데이트 캐시와 수동 확인 결과를 구분해 제공한다", async (context) => {
  const step = createSteps(context)
  const response = await step("업데이트 캐시를 읽는다", () => http("/api/updates"))
  await step("개발 설치의 비지원 상태를 최신 버전으로 표시하지 않는다", () => {
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ supported: false, version: null, busy: false })
    expect(response.body.currentVersion).toMatch(/^\d+\.\d+\.\d+/)
  })
  const checked = await step("설치를 시작하지 않고 수동 확인을 요청한다", () =>
    http("/api/updates/check", "POST"),
  )
  await step("확인 불가 원인과 정상 서비스 상태를 확인한다", async () => {
    expect(checked.status).toBe(200)
    expect(checked.body.error).toContain("unavailable")
    expect((await http("/api/health")).status).toBe(200)
  })
  await step("외부 페이지의 업데이트 요청을 거절한다", async () => {
    const status = await node<number>(
      `const response = await fetch('http://127.0.0.1:54318/api/updates/check', {method:'POST',headers:{Origin:'https://example.com'}});console.log(JSON.stringify(response.status))`,
    )
    expect(status).toBe(403)
  })
})
