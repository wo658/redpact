import { expect, test } from "vitest"
import { createShop } from "../src/shop.js"
import { paymentMock } from "../tests/payment.js"

// Deliberately wrong expectation: two items at 1250 cents do not cost 1250 cents.
test("review detects an incorrect order total", async () => {
  const shop = createShop({ stock: 3, priceCents: 1250, charge: paymentMock().charge })
  expect((await shop.checkout({ quantity: 2 })).totalCents).toBe(1250)
})
