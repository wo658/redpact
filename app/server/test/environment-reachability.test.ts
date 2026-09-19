import { once } from "node:events"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "vitest"
import { verifyBrowserEndpoints } from "../src/adapters/environment/reachability.js"
import type { Environment } from "../src/core/types/environment.js"

test.each([200, 302, 401, 404, 503])(
  "호스트 도달 가능 검사는 HTTP %s 응답을 인정하고 리다이렉트를 따라가지 않는다",
  async (status) => {
    const server = createServer((_req, res) => {
      res.writeHead(status, { Location: "http://unreachable.invalid/" })
      res.end()
    }).listen(0, "127.0.0.1")
    await once(server, "listening")
    const endpoint = { host: "127.0.0.1", port: (server.address() as AddressInfo).port }
    try {
      const record = {
        settings: { tests: { env: {} } },
        specification: { playwright: { service: "app", port: 8080, scheme: "http" } },
      } as unknown as Environment
      await expect(
        verifyBrowserEndpoints(record, { "app:8080": endpoint }, new AbortController().signal),
      ).resolves.toBeUndefined()
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
)

test("웹 연결 선언이 없는 포트는 HTTP로 검사하지 않는다", async () => {
  const record = { settings: { tests: { env: {} } }, specification: {} } as unknown as Environment
  await expect(
    verifyBrowserEndpoints(
      record,
      { "db:5432": { host: "127.0.0.1", port: 1 } },
      new AbortController().signal,
    ),
  ).resolves.toBeUndefined()
})

test("접속 검사 취소는 즉시 전달한다", async () => {
  const record = {
    settings: {
      tests: { env: { APP: { service: "app", port: 8080, scheme: "http", value: "url" } } },
    },
    specification: {},
  } as unknown as Environment
  const controller = new AbortController()
  controller.abort(new Error("Stopped"))
  await expect(
    verifyBrowserEndpoints(
      record,
      { "app:8080": { host: "127.0.0.1", port: 1 } },
      controller.signal,
    ),
  ).rejects.toThrow("Stopped")
})
