import { expect, test } from "./fixtures.js"

test("checkout uses the configured payment mock", async ({ api }) => {
  const response = await api.checkout()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ quantity: 1, totalCents: 250 })
})
