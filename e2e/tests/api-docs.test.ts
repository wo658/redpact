import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http } from "./target"

test("API 문서의 토큰 없는 접근 안내와 공개 명세가 실제 서버에서 일치한다", async (context) => {
  const step = createSteps(context)
  for (const path of ["/docs", "/swagger", "/redoc"]) {
    await step(`${path}가 토큰 요구 없이 로컬 접근 경계를 안내한다`, async () => {
      const response = await http<string>(path)
      expect(response.status).toBe(200)
      expect(response.body).toContain("No API token is required")
      expect(response.body).toContain("local host and same-origin")
      expect(response.body).not.toContain("REDPACT_TOKEN")
      expect(response.body).not.toContain("Authorize dialog")
    })
  }
  await step("명세와 실제 상태 조회가 토큰 없이 성공한다", async () => {
    const specification = await http<{ security: unknown[]; paths: Record<string, unknown> }>(
      "/openapi.json",
    )
    expect(specification.status).toBe(200)
    expect(specification.body.security).toEqual([])
    expect(specification.body.paths).toHaveProperty("/api/health")
    expect((await http("/api/health")).status).toBe(200)
  })
})
