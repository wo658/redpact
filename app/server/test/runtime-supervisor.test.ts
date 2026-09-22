import type { ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { expect, test, vi } from "vitest"
import { superviseRuntime } from "../src/workflows/runtime-supervisor.js"

function child() {
  return Object.assign(new EventEmitter(), {
    connected: true,
    exitCode: null as number | null,
    signalCode: null,
    send: vi.fn((_message: unknown, callback: () => void) => callback()),
  })
}

test("작업 중인 서버는 패키지를 교체하거나 재시작하지 않는다", async () => {
  const first = child()
  const start = vi.fn(() => first as unknown as ChildProcess)
  const install = vi.fn(async () => {})
  const exit = vi.fn()
  superviseRuntime({ start, install, exit })
  first.emit("message", { runtimeUpdate: "0.3.0" })
  first.emit("message", { runtimeControl: "busy" })
  await vi.waitFor(() =>
    expect(first.send).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeUpdateError: expect.stringContaining("Active work") }),
      expect.any(Function),
    ),
  )
  expect(install).not.toHaveBeenCalled()
  expect(start).toHaveBeenCalledTimes(1)
  expect(exit).not.toHaveBeenCalled()
})

test("유휴 종료 확인과 실제 프로세스 종료 후 설치하고 같은 실행 설정으로 재시작한다", async () => {
  const first = child()
  const second = child()
  const start = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
  const install = vi.fn(async () => {})
  const exit = vi.fn()
  superviseRuntime({ start, install, exit })
  first.emit("message", { runtimeReady: 54319 })
  first.emit("message", { runtimeUpdate: "0.3.0" })
  first.emit("message", { runtimeUpdate: "0.3.0" })
  first.emit("message", { runtimeControl: "stopped" })
  await new Promise((resolve) => setImmediate(resolve))
  expect(install).not.toHaveBeenCalled()
  first.exitCode = 0
  first.emit("exit", 0)
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2))
  expect(start).toHaveBeenLastCalledWith(undefined, 54319)
  expect(install).toHaveBeenCalledExactlyOnceWith("0.3.0")
  expect(exit).not.toHaveBeenCalled()
})

test("패키지 설치 실패는 다시 실행한 서버에 오류를 전달한다", async () => {
  const first = child()
  const start = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(child())
  superviseRuntime({
    start,
    install: async () => {
      throw new Error("Registry unavailable")
    },
    exit: vi.fn(),
  })
  first.emit("message", { runtimeUpdate: "0.3.0" })
  first.emit("message", { runtimeControl: "stopped" })
  first.exitCode = 0
  first.emit("exit", 0)
  await vi.waitFor(() => expect(start).toHaveBeenLastCalledWith("Registry unavailable", undefined))
})
