import { once } from "node:events"
import { createServer } from "node:http"
import { expect, test } from "vitest"
import { createBridge } from "../src/redpact/bridge.js"

test("앱 전용 연결은 API 상태·바이너리·실제 SSE 변경을 전달하고 외부 주소를 거부한다", async () => {
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/api/events")) {
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.write('data: {"changed":true}\n\n')
      return
    }
    if (req.url === "/api/redirect") {
      res.writeHead(302, { location: "http://example.com" }).end()
      return
    }
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    res
      .writeHead(409, { "content-type": "application/octet-stream" })
      .end(Buffer.concat([Buffer.from([0, 255, 128]), ...chunks]))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("테스트 주소 없음")
  }
  const bridge = createBridge(`http://127.0.0.1:${address.port}`)
  try {
    const response = await bridge.request("/api/example", "PATCH", "변경")
    expect(response.status).toBe(409)
    expect(Buffer.from(response.body, "base64")).toEqual(
      Buffer.concat([Buffer.from([0, 255, 128]), Buffer.from("변경")]),
    )
    for (const path of [
      "http://example.com/api",
      "//example.com/api",
      "/api/../../private",
      "/api/\\evil",
      "/private",
    ]) {
      await expect(bridge.request(path, "GET")).rejects.toThrow()
    }
    await expect(bridge.request("/api/redirect", "GET")).rejects.toThrow()
    await expect(bridge.request("/api/events", "GET")).rejects.toThrow()
    bridge.events("scope", "/api/events?scope=unit")
    await expect.poll(() => bridge.events("scope", "/api/events?scope=unit").revision).toBe(1)
    expect(() => bridge.events("scope", "/api/events?scope=checkout")).toThrow()
    bridge.events("scope", "/api/events?scope=unit", true)
    expect(bridge.events("scope", "/api/events?scope=unit").revision).toBe(0)
  } finally {
    bridge.close()
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
})
