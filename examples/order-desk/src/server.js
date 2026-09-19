import { createServer } from "node:http"
import { createShop } from "./shop.js"

const shop = createShop({
  stock: 100,
  priceCents: 250,
  charge: async () => {
    if (process.env.PAYMENTS_MODE !== "mock") {
      throw new Error("Configure a supported payment mode")
    }
  },
})
createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json")
  if (request.url === "/health") {
    return response.end('{"ready":true}')
  }
  if (request.method !== "POST" || request.url !== "/checkout") {
    response.statusCode = 404
    return response.end('{"error":"Unknown route"}')
  }
  try {
    // This local fixture accepts one item per request and keeps state between test runs.
    response.end(JSON.stringify(await shop.checkout({ quantity: 1 })))
  } catch (error) {
    response.statusCode = 400
    response.end(JSON.stringify({ error: error.message }))
  }
}).listen(3000, "0.0.0.0")
