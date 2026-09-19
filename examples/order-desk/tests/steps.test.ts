import { expect, test } from "vitest"
import { createSteps } from "./steps"

/** Execute a dependent checkout flow against the managed HTTP app; payment is mocked and orders are held in memory. */
test("Checkout: API → order response → total validation", async (context) => {
  const step = createSteps(context)
  const response = await step("Submit checkout to the API", async () => {
    const result = await fetch(`${process.env.APP_URL}/checkout`, { method: "POST" })
    expect(result.status).toBe(200)
    return result
  })
  const order = await step("Read the created order", async () => {
    const result = await response.json()
    expect(result.quantity).toBe(1)
    return result
  })
  await step("Verify the order total", () => {
    expect(order.totalCents).toBe(250)
  })
})
