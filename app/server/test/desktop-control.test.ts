import { PassThrough } from "node:stream"
import { expect, test, vi } from "vitest"
import { createDesktopControl } from "../src/interfaces/desktop/control.js"

test("부모가 연결을 닫으면 서버를 정리하고 끊긴 파이프에 응답하지 않는다", async () => {
  const input = new PassThrough()
  const stop = vi.fn(async () => {})
  const send = vi.fn()
  createDesktopControl({ input, stop, send, busy: () => false })
  input.end()
  await expect.poll(() => stop.mock.calls.length).toBe(1)
  expect(send).not.toHaveBeenCalled()
})

test("업데이트는 실행 중인 작업을 중단하지 않고 요청 처리를 재개한다", async () => {
  const input = new PassThrough()
  const stop = vi.fn(async () => {})
  const send = vi.fn()
  const control = createDesktopControl({ input, stop, send, busy: () => true })
  input.write("update\n")
  await expect.poll(() => send.mock.calls).toEqual([[{ desktop: "busy" }]])
  expect(stop).not.toHaveBeenCalled()
  expect((await control.fetch(() => new Response("ok"))).status).toBe(200)
  control.close()
})

test("업데이트는 이미 받은 요청이 끝난 뒤 작업 상태를 확인한다", async () => {
  const input = new PassThrough()
  let finish: (response: Response) => void = () => {}
  let busy = false
  const stop = vi.fn(async () => {})
  const send = vi.fn()
  const control = createDesktopControl({ input, stop, send, busy: () => busy })
  const pending = control.fetch(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  input.write("update\n")
  expect((await control.fetch(() => new Response("unexpected"))).status).toBe(503)
  busy = true
  finish(new Response("started"))
  await pending
  await expect.poll(() => send.mock.calls).toEqual([[{ desktop: "busy" }]])
  expect(stop).not.toHaveBeenCalled()
  busy = false
  input.write("update\n")
  await expect.poll(() => stop.mock.calls.length).toBe(1)
  expect(send).toHaveBeenLastCalledWith({ desktop: "stopped" })
  control.close()
})

test("업데이트 대기 중 부모 연결이 끊기면 바쁜 서버도 종료한다", async () => {
  const input = new PassThrough()
  let finish: (response: Response) => void = () => {}
  const stop = vi.fn(async () => {})
  const control = createDesktopControl({ input, stop, send: () => {}, busy: () => true })
  const pending = control.fetch(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  input.write("update\n")
  input.end()
  await new Promise((resolve) => setTimeout(resolve, 10))
  finish(new Response("done"))
  await pending
  await expect.poll(() => stop.mock.calls.length).toBe(1)
  control.close()
})
