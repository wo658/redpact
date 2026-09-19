import { test } from "vitest"
import { createShop } from "../src/shop.js"
import { paymentMock } from "../tests/payment.js"

// An unexpected dependency rejection is not assertion evidence.
test("unhandled payment outage", async () => {
  const shop = createShop({
    stock: 1,
    priceCents: 100,
    charge: paymentMock({ failures: 1 }).charge,
  })
  await shop.checkout({ quantity: 1 })
})
