import { expect, test } from "vitest"
import { createShop } from "../src/shop.js"
import { paymentMock } from "./payment.js"

// A successful checkout consumes inventory and records the charged total in cents.
test("checkout records an order and charges an integer total", async () => {
  const payment = paymentMock()
  const shop = createShop({ stock: 3, priceCents: 1250, charge: payment.charge })
  const order = await shop.checkout({ quantity: 2 })
  expect(order).toEqual({ id: 1, quantity: 2, totalCents: 2500 })
  expect(payment.charges).toEqual([2500])
  expect(shop.stock()).toBe(1)
  expect(shop.orders()).toEqual([order])
})

test("invalid quantities never charge or consume inventory", async () => {
  const payment = paymentMock()
  const shop = createShop({ stock: 3, priceCents: 100, charge: payment.charge })
  for (const quantity of [0, -1, 1.5, NaN, Infinity, "1"]) {
    await expect(shop.checkout({ quantity })).rejects.toThrow("Invalid quantity")
  }
  expect(shop.stock()).toBe(3)
  expect(payment.charges).toEqual([])
})

test("out of stock orders never reach payment", async () => {
  const payment = paymentMock()
  const shop = createShop({ stock: 1, priceCents: 100, charge: payment.charge })
  await expect(shop.checkout({ quantity: 2 })).rejects.toThrow("Out of stock")
  expect(payment.charges).toEqual([])
  expect(shop.stock()).toBe(1)
})

// A dependency rejection is handled business behavior when the test expects it.
test("payment rejection restores inventory and permits retry", async () => {
  const payment = paymentMock({ failures: 1 })
  const shop = createShop({ stock: 1, priceCents: 100, charge: payment.charge })
  await expect(shop.checkout({ quantity: 1 })).rejects.toThrow("Payment unavailable")
  expect(shop.stock()).toBe(1)
  expect(shop.orders()).toEqual([])
  expect(await shop.checkout({ quantity: 1 })).toEqual({ id: 1, quantity: 1, totalCents: 100 })
  expect(shop.stock()).toBe(0)
})

test("concurrent checkouts cannot oversell the last item", async () => {
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const shop = createShop({ stock: 1, priceCents: 100, charge: () => pending })
  const first = shop.checkout({ quantity: 1 })
  try {
    await expect(shop.checkout({ quantity: 1 })).rejects.toThrow("Out of stock")
  } finally {
    release()
    await first
  }
  expect(shop.stock()).toBe(0)
  expect(shop.orders()).toHaveLength(1)
})

test("returned orders cannot mutate stored evidence", async () => {
  const shop = createShop({ stock: 2, priceCents: 100, charge: paymentMock().charge })
  const order = await shop.checkout({ quantity: 1 })
  order.totalCents = 0
  const orders = shop.orders()
  orders[0].quantity = 999
  orders.push(order)
  expect(shop.orders()).toEqual([{ id: 1, quantity: 1, totalCents: 100 }])
})

test("separate shops do not share inventory", async () => {
  const options = { stock: 1, priceCents: 100, charge: paymentMock().charge }
  const first = createShop(options)
  const second = createShop(options)
  await first.checkout({ quantity: 1 })
  expect(second.stock()).toBe(1)
  expect(second.orders()).toEqual([])
})
