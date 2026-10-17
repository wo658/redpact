import assert from "node:assert/strict"
import { isAbsolute, join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const root = process.env.PILOT_CHECKOUT
assert.ok(root && isAbsolute(root), "PILOT_CHECKOUT must be an absolute fixture root")
const { createApp } = await import(pathToFileURL(join(root, "src/server.ts")).href)

async function withApp(run: (origin: string) => Promise<void>) {
  const server = createApp()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    )
  }
}
async function state(origin: string) {
  return {
    inventory: await (await fetch(`${origin}/inventory`)).json(),
    orders: await (await fetch(`${origin}/orders`)).json(),
  }
}
function checkout(origin: string, body: string) {
  return fetch(`${origin}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

test("API: 요청 수량 2를 결제 총액과 재고에 반영한다", async () => {
  await withApp(async (origin) => {
    const response = await checkout(origin, '{"quantity":2}')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: 4, quantity: 2, totalCents: 500 })
    const after = await state(origin)
    assert.deepEqual(after.inventory, { stock: 98, paymentAttempts: 1 })
    assert.equal(after.orders.length, 4)
  })
})

test("API: 빈 요청 본문은 기존 수량 1 동작을 유지한다", async () => {
  await withApp(async (origin) => {
    const response = await checkout(origin, "")
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: 4, quantity: 1, totalCents: 250 })
  })
})

for (const body of [
  "{",
  "null",
  "[]",
  "{}",
  '{"quantity":0}',
  '{"quantity":-2}',
  '{"quantity":1.5}',
  '{"quantity":"2"}',
  '{"quantity":null}',
  '{"quantity":9007199254740992}',
]) {
  test(`API: 잘못된 입력 ${body}은 상태를 변경하지 않으며 후속 주문을 허용한다`, async () => {
    await withApp(async (origin) => {
      const before = await state(origin)
      const response = await checkout(origin, body)
      assert.equal(response.status, 400)
      assert.deepEqual(await state(origin), before)
      const valid = await checkout(origin, '{"quantity":3}')
      assert.equal(valid.status, 200)
      assert.equal((await valid.json()).quantity, 3)
      assert.equal((await state(origin)).inventory.stock, 97)
    })
  })
}
