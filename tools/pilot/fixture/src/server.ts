import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { pathToFileURL } from "node:url"
import { readQuantity } from "./checkout-request.ts"
import { createPayment } from "./payment.ts"
import { createShop } from "./shop.ts"

export function createApp() {
  const payment = createPayment({
    transientFailures: Number(process.env.PAYMENT_FAILURES ?? 0),
    permanent: process.env.PAYMENT_PERMANENT === "1",
  })
  const shop = createShop({ stock: 100, priceCents: 250, charge: payment.charge })
  return createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json")
    try {
      if (request.method === "GET" && request.url === "/") {
        response.setHeader("Content-Type", "text/html; charset=utf-8")
        response.end(await readFile(new URL("./page.html", import.meta.url)))
        return
      }
      if (request.method === "GET" && request.url === "/health") {
        response.end('{"ready":true}')
        return
      }
      if (request.method === "GET" && request.url === "/orders") {
        response.end(JSON.stringify(shop.orders()))
        return
      }
      if (request.method === "GET" && request.url === "/inventory") {
        response.end(JSON.stringify({ stock: shop.stock(), paymentAttempts: payment.attempts() }))
        return
      }
      if (request.method === "POST" && request.url === "/checkout") {
        let body = ""
        for await (const chunk of request) {
          body += chunk.toString()
        }
        response.end(JSON.stringify(await shop.checkout({ quantity: readQuantity(body) })))
        return
      }
      response.statusCode = 404
      response.end('{"error":"Unknown route"}')
    } catch (error) {
      response.statusCode = 400
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }),
      )
    }
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(Number(process.env.PORT ?? 3000), "0.0.0.0")
}
