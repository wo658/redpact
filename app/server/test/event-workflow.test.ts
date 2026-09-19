import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

test("SSE 전송 계층은 관찰 어댑터 구독이나 도메인 범위를 직접 관리하지 않는다", () => {
  const source = readFileSync(new URL("../src/interfaces/http/events.ts", import.meta.url), "utf8")
  expect(source).not.toContain("services.changes")
  expect(source).not.toContain("eventScope(")
  expect(source).not.toContain("watcher.subscribe(")
})

test("구독 갱신 중 중단되면 새 관찰을 열지 않고 기존 구독은 한 번만 닫는다", async () => {
  const { prepareEvents } = await import("../src/workflows/events.js")
  const { vi } = await import("vitest")
  let release: () => void = () => {}
  const closing = new Promise<void>((resolve) => {
    release = resolve
  })
  const close = vi.fn(() => closing)
  const subscribe = vi.fn(() => ({ ready: Promise.resolve(), close }))
  const paths = ["/checkout"]
  const services = {
    dataDirectory: "/runtime",
    changes: { subscribe },
    worktrees: {
      checkoutPaths: async () => [...paths],
      getProject: () => ({ id: "p", location: { kind: "directory", root: "/checkout" } }),
    },
  }
  const prepared = await prepareEvents(services as never, { projectId: "p" })
  expect(subscribe).not.toHaveBeenCalled()
  const controller = new AbortController()
  const observation = prepared.observe(
    controller.signal,
    () => {},
    () => {},
  )
  paths.push("/linked")
  const refresh = observation.refresh()
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  controller.abort()
  const finish = observation.close()
  release()
  await Promise.all([refresh, finish])
  expect(subscribe).toHaveBeenCalledTimes(1)
  expect(close).toHaveBeenCalledTimes(1)
})

test("구독 준비 중에도 중단 후 정리할 수 있고 늦은 변경은 전송하지 않는다", async () => {
  const { prepareEvents } = await import("../src/workflows/events.js")
  const { vi } = await import("vitest")
  let notify: (paths?: string[]) => void = () => {}
  const close = vi.fn(async () => {})
  const changed = vi.fn()
  const prepared = await prepareEvents(
    {
      dataDirectory: "/runtime",
      changes: {
        subscribe: (_roots: unknown, callback: typeof notify) => {
          notify = callback
          return { ready: new Promise<void>(() => {}), close }
        },
      },
    } as never,
    {},
  )
  const controller = new AbortController()
  const observation = prepared.observe(controller.signal, changed, () => {})
  controller.abort()
  await observation.close()
  notify()
  await Promise.resolve()
  expect(close).toHaveBeenCalledTimes(1)
  expect(changed).not.toHaveBeenCalled()
})
