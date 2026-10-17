import { expect, test } from "vitest"
import { createSteps } from "./steps.ts"

test("공개 HTTP 앱의 준비 상태와 독립 주문 seed를 확인한다", async (context) => {
  const step = createSteps(context)
  const origin = process.env.APP_URL
  expect(origin, "실행 환경이 APP_URL을 제공해야 한다").toBeTruthy()
  await step("실제 앱의 health 응답을 확인한다", async () => {
    const response = await fetch(new URL("/health", origin))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ready: true })
  })
  await step("HTTP 주문 목록에서 수량 1·2·3 seed를 확인한다", async () => {
    const response = await fetch(new URL("/orders", origin))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: 1, quantity: 1, totalCents: 250 },
      { id: 2, quantity: 2, totalCents: 500 },
      { id: 3, quantity: 3, totalCents: 750 },
    ])
  })
  await step("초기 재고와 결제 미실행 상태를 확인한다", async () => {
    const response = await fetch(new URL("/inventory", origin))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ stock: 100, paymentAttempts: 0 })
  })
})
