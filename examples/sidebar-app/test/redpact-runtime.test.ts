import { expect, test, vi } from "vitest"
import { createRuntime } from "../src/redpact/runtime.js"

test("서버가 꺼져 있을 때 명시적인 시작 요청만 serve를 한 번 실행한다", async () => {
  let running = false
  const launch = vi.fn(async () => {
    running = true
  })
  const runtime = createRuntime({
    inspect: async () => ({ state: running ? "running" : "stopped" }),
    launch,
  })
  expect((await runtime.status()).state).toBe("stopped")
  expect(launch).not.toHaveBeenCalled()
  const results = await Promise.all([runtime.start(), runtime.start()])
  expect(results.every((result) => result.state === "running")).toBe(true)
  expect(launch).toHaveBeenCalledTimes(1)
})

test("이미 실행 중이거나 다른 서비스가 포트를 사용하면 새 서버를 실행하지 않는다", async () => {
  for (const state of ["running", "blocked"]) {
    const launch = vi.fn(async () => {})
    const runtime = createRuntime({ inspect: async () => ({ state }), launch })
    await runtime.start()
    await runtime.status()
    expect(launch).not.toHaveBeenCalled()
  }
})

test("시작과 중지가 겹쳐도 순서대로 처리하고 다시 시작할 수 있다", async () => {
  let running = false
  const events: string[] = []
  const runtime = createRuntime({
    inspect: async () => ({ state: running ? "running" : "stopped", owned: running }),
    launch: async () => {
      events.push("start")
      running = true
    },
    halt: async () => {
      events.push("stop")
      running = false
    },
  })
  await Promise.all([runtime.start(), runtime.stop()])
  expect((await runtime.status()).state).toBe("stopped")
  await runtime.start()
  expect(events).toEqual(["start", "stop", "start"])
})

test("런타임 상태 조회는 설치된 런타임을 시작하지 않고 명시적인 시작을 기다린다", async () => {
  let running = false
  const launch = vi.fn(async () => {
    running = true
  })
  const runtime = createRuntime({
    inspect: async () => ({
      state: running ? "running" : "stopped",
      installation: { state: "installed" },
    }),
    launch,
    halt: async () => {
      running = false
    },
  })
  await runtime.status()
  expect((await runtime.status()).state).toBe("stopped")
  expect(launch).not.toHaveBeenCalled()
  await runtime.start()
  expect((await runtime.status()).state).toBe("running")
  expect(launch).toHaveBeenCalledTimes(1)
  await runtime.stop()
  expect((await runtime.status()).state).toBe("stopped")
  expect(launch).toHaveBeenCalledTimes(1)
})

test("런타임 상태 조회는 미설치와 설치 중 및 실패 상태를 자동 설치하지 않는다", async () => {
  for (const state of ["missing", "installing", "failed"]) {
    const launch = vi.fn(async () => {})
    const runtime = createRuntime({
      inspect: async () => ({ state: "stopped", installation: { state } }),
      launch,
    })
    await runtime.status()
    expect(launch).not.toHaveBeenCalled()
  }
})
