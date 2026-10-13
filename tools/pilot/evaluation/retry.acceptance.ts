import assert from "node:assert/strict"
import { isAbsolute, join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const root = process.env.PILOT_CHECKOUT
assert.ok(root && isAbsolute(root), "PILOT_CHECKOUT must be an absolute fixture root")
const { createPayment } = await import(pathToFileURL(join(root, "src/payment.ts")).href)
const { createShop } = await import(pathToFileURL(join(root, "src/shop.ts")).href)
const { createApp } = await import(pathToFileURL(join(root, "src/server.ts")).href)

test("재시도: 일시 오류 2회 뒤 성공하면 주문과 재고를 한 번 반영한다", async () => {
  const payment = createPayment({ transientFailures: 2 })
  const shop = createShop({ stock: 10, priceCents: 250, charge: payment.charge })
  assert.deepEqual(await shop.checkout({ quantity: 2 }), { id: 4, quantity: 2, totalCents: 500 })
  assert.equal(payment.attempts(), 3)
  assert.equal(shop.stock(), 8)
  assert.equal(shop.orders().length, 4)
})

test("재시도: 총 3회 실패 후 재고 복구와 다음 요청 성공을 보장한다", async () => {
  const payment = createPayment({ transientFailures: 3 })
  const shop = createShop({ stock: 10, priceCents: 250, charge: payment.charge })
  await assert.rejects(shop.checkout({ quantity: 2 }), /Payment unavailable/)
  assert.equal(payment.attempts(), 3)
  assert.equal(shop.stock(), 10)
  assert.equal(shop.orders().length, 3)
  await shop.checkout({ quantity: 2 })
  assert.equal(payment.attempts(), 4)
  assert.equal(shop.stock(), 8)
  assert.equal(shop.orders().length, 4)
})

test("재시도: 영구 결제 거절은 한 번만 호출한다", async () => {
  const payment = createPayment({ permanent: true })
  const shop = createShop({ stock: 1, priceCents: 250, charge: payment.charge })
  await assert.rejects(shop.checkout({ quantity: 1 }), /Payment declined/)
  assert.equal(payment.attempts(), 1)
  assert.equal(shop.stock(), 1)
  assert.equal(shop.orders().length, 3)
})

test("재시도: 병렬 주문에서 마지막 재고를 초과 판매하지 않는다", async () => {
  const payment = createPayment({ transientFailures: 2 })
  const shop = createShop({ stock: 1, priceCents: 250, charge: payment.charge })
  const results = await Promise.allSettled([
    shop.checkout({ quantity: 1 }),
    shop.checkout({ quantity: 1 }),
  ])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected").length, 1)
  assert.equal(payment.attempts(), 3)
  assert.equal(shop.stock(), 0)
  assert.equal(shop.orders().length, 4)
})

test("재시도: 실제 HTTP 요청도 일시 결제 오류를 복구한다", async () => {
  const previous = process.env.PAYMENT_FAILURES
  process.env.PAYMENT_FAILURES = "2"
  const server = createApp()
  if (previous === undefined) {
    delete process.env.PAYMENT_FAILURES
  } else {
    process.env.PAYMENT_FAILURES = previous
  }
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`
    const response = await fetch(`${origin}/checkout`, { method: "POST" })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).quantity, 1)
    assert.deepEqual(await (await fetch(`${origin}/inventory`)).json(), {
      stock: 99,
      paymentAttempts: 3,
    })
    assert.equal((await (await fetch(`${origin}/orders`)).json()).length, 4)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    )
  }
})

test("재시도: 알 수 없는 공급자 오류는 재시도하지 않고 상태를 복구한다", async () => {
  const payment = createPayment({ unknownFailure: true })
  const shop = createShop({ stock: 10, priceCents: 250, charge: payment.charge })
  await assert.rejects(shop.checkout({ quantity: 2 }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.constructor, Error)
    assert.equal(error.message, "Unexpected provider error")
    return true
  })
  assert.equal(payment.attempts(), 1)
  assert.equal(shop.stock(), 10)
  assert.equal(shop.orders().length, 3)
})
