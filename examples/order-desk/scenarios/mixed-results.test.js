import { expect, test } from "vitest"
import { createShop } from "../src/shop.js"
import { paymentMock } from "../tests/payment.js"
import { createSteps } from "../tests/steps"

/** Review a successful checkout using an in-process shop and mocked payment. */
test("Checkout with the correct total", async (context) => {
  const step = createSteps(context)
  const shop = createShop({ stock: 3, priceCents: 1250, charge: paymentMock().charge })
  const order = await step("Create an order for two items", () => shop.checkout({ quantity: 2 }))
  await step("Verify the order total", () => expect(order.totalCents).toBe(2500))
})

/** Deliberately fail the total check so the review retains a real assertion failure. */
test("Checkout with an incorrect total expectation", async (context) => {
  const step = createSteps(context)
  const shop = createShop({ stock: 3, priceCents: 1250, charge: paymentMock().charge })
  const order = await step("Create an order for two items", () => shop.checkout({ quantity: 2 }))
  await step("Verify the intentionally incorrect total", () => expect(order.totalCents).toBe(1250))
})
