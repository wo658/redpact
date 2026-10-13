import assert from "node:assert/strict"
import { test } from "node:test"
import { readQuantity } from "../src/checkout-request.ts"
import { createPayment } from "../src/payment.ts"
import { createShop } from "../src/shop.ts"

test("기준 앱은 주문 재고와 총액을 기록한다", async () => {
  const payment = createPayment()
  const shop = createShop({ stock: 100, priceCents: 250, charge: payment.charge })
  assert.deepEqual(await shop.checkout({ quantity: 2 }), { id: 4, quantity: 2, totalCents: 500 })
  assert.equal(shop.stock(), 98)
  assert.equal(shop.orders().length, 4)
})
test("기준 앱은 입력 수량을 아직 사용하지 않는다", () => {
  assert.equal(readQuantity('{"quantity":2}'), 1)
})
test("기준 앱은 결제 오류를 재시도하지 않고 재고를 복구한다", async () => {
  const payment = createPayment({ transientFailures: 1 })
  const shop = createShop({ stock: 100, priceCents: 250, charge: payment.charge })
  await assert.rejects(shop.checkout({ quantity: 1 }), /Payment unavailable/)
  assert.equal(payment.attempts(), 1)
  assert.equal(shop.stock(), 100)
  assert.equal(shop.orders().length, 3)
  await shop.checkout({ quantity: 1 })
  assert.equal(shop.stock(), 99)
})
test("기준 앱의 주문 seed와 상태는 인스턴스 간 독립적이다", async () => {
  const options = { stock: 100, priceCents: 250, charge: createPayment().charge }
  const first = createShop(options)
  const second = createShop(options)
  await first.checkout({ quantity: 1 })
  assert.equal(second.stock(), 100)
  assert.deepEqual(
    second.orders().map((order) => order.quantity),
    [1, 2, 3],
  )
})

test("기준 앱 HTTP는 seed, 화면, 재고, 기존 주문 입력 동작을 제공한다", async () => {
  const { createApp } = await import("../src/server.ts")
  const server = createApp()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`
    assert.deepEqual(await (await fetch(`${origin}/health`)).json(), { ready: true })
    assert.equal((await (await fetch(`${origin}/orders`)).json()).length, 3)
    assert.match(await (await fetch(origin)).text(), /<h1>Order Desk<\/h1>/)
    const response = await fetch(`${origin}/checkout`, { method: "POST", body: '{"quantity":2}' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: 4, quantity: 1, totalCents: 250 })
    assert.deepEqual(await (await fetch(`${origin}/inventory`)).json(), {
      stock: 99,
      paymentAttempts: 1,
    })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})

test("기준 결제 fixture는 알 수 없는 공급자 오류를 주입한다", async () => {
  const payment = createPayment({ unknownFailure: true })
  await assert.rejects(payment.charge(250), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.constructor, Error)
    assert.equal(error.message, "Unexpected provider error")
    return true
  })
  assert.equal(payment.attempts(), 1)
})
