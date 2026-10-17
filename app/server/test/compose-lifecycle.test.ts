import { describe, expect, it, vi } from "vitest"
import { createComposeLifecycle } from "../src/adapters/environment/compose-lifecycle.js"

describe("임시 Compose 환경 수명", () => {
  it("준비 후 핸들을 유지하고 종료 시 Compose와 네트워크를 순서대로 정리한다", async () => {
    const events: string[] = []
    const environment = {
      down: vi.fn(async () => {
        events.push("down")
      }),
    }
    const network = {
      stop: vi.fn(async () => {
        events.push("network")
      }),
    }
    const lifecycle = createComposeLifecycle()
    lifecycle.network(network)
    lifecycle.environment(environment)
    expect(events).toEqual([])
    await lifecycle.stop()
    expect(events).toEqual(["down", "network"])
    expect(environment.down).toHaveBeenCalledWith({ removeVolumes: true, timeout: 10_000 })
  })
  it("Compose 정리 실패를 숨기지 않고 재시도할 핸들을 유지한다", async () => {
    const down = vi
      .fn()
      .mockRejectedValueOnce(new Error("cleanup unavailable"))
      .mockResolvedValue(undefined)
    const stop = vi.fn().mockResolvedValue(undefined)
    const lifecycle = createComposeLifecycle()
    lifecycle.network({ stop })
    lifecycle.environment({ down })
    await expect(lifecycle.stop()).rejects.toThrow("cleanup unavailable")
    expect(stop).not.toHaveBeenCalled()
    await lifecycle.stop()
    expect(down).toHaveBeenCalledTimes(2)
    expect(stop).toHaveBeenCalledTimes(1)
  })
})

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startComposeSession } from "../src/adapters/environment/compose-session.js"

it("준비 실패 로그를 보존하고 정리 요청까지 worker 연결을 유지한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compose-session-"))
  const session = startComposeSession({
    executable: process.execPath,
    args: [
      "-e",
      `
      process.stdin.resume();
      process.stdin.on('end', () => {
        process.stderr.write('build failed: actual diagnostic\\n');
        process.send({type:'service-log', message:'service failed before readiness\\n'});
        process.send({type:'service-log', source:'a:stdout', message:'split-sec'});
        process.send({type:'service-log', source:'b:stdout', message:'other service\\n'});
        process.send({type:'service-log', source:'a:stdout', message:'ret\\n'});
        process.send({type:'service-log', source:'boundary', message:'CUT_BOUNDARY_SENSITIVE' + 'x'.repeat(16380)});
        process.send({type:'failed', message:'readiness rejected'});
      });
      process.on('message', () => {
        process.send({type:'service-log', message:'shutdown evidence\\n'});
        process.send({type:'stopped'});
        process.disconnect();
      });
    `,
    ],
    cwd: directory,
    env: process.env,
    spec: {},
    signal: AbortSignal.timeout(5000),
    preparationLog: join(directory, "preparation.log"),
    servicesLog: join(directory, "services.log"),
    redact: (value) => value,
    redactions: ["split-secret", "CUT_BOUNDARY_SENSITIVE"],
  })
  try {
    const failure = await session.ready.catch((error: Error) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain("readiness rejected")
    expect((failure as Error).message).not.toContain("SENSITIVE")
    expect((failure as Error).message).toContain("[REDACTED]")
    await session.stop(5000)
    expect(await readFile(join(directory, "preparation.log"), "utf8")).toContain(
      "actual diagnostic",
    )
    expect(await readFile(join(directory, "services.log"), "utf8")).toContain(
      "service failed before readiness",
    )
    const services = await readFile(join(directory, "services.log"), "utf8")
    expect(services).toContain("shutdown evidence")
    expect(services).toContain("[REDACTED]")
    expect(services).not.toContain("split-sec")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it("준비 취소는 stdout과 stderr의 마지막 마스킹 버퍼를 저장한 뒤 반환한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compose-abort-"))
  const session = startComposeSession({
    executable: process.execPath,
    args: [
      "-e",
      `process.stdin.resume(); process.stdin.on('end', () => {
      process.stdout.write('stdout-final-marker'); process.stderr.write('stderr-final-marker');
      setInterval(() => {}, 1000);
    });`,
    ],
    cwd: directory,
    env: process.env,
    spec: {},
    signal: AbortSignal.timeout(700),
    preparationLog: join(directory, "preparation.log"),
    servicesLog: join(directory, "services.log"),
    redact: (value) => value,
    redactions: ["s".repeat(100)],
  })
  try {
    const failure = await session.ready.catch((error: Error) => error)
    expect((failure as Error).message).toContain("stdout-final-marker")
    expect((failure as Error).message).toContain("stderr-final-marker")
    const logs = await readFile(join(directory, "preparation.log"), "utf8")
    expect(logs).toContain("stdout-final-marker")
    expect(logs).toContain("stderr-final-marker")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it("로그 저장 실패가 원래 Compose 실패 원인을 덮어쓰지 않는다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compose-log-write-"))
  const { mkdir } = await import("node:fs/promises")
  await mkdir(join(directory, "preparation.log"))
  const session = startComposeSession({
    executable: process.execPath,
    args: [
      "-e",
      `process.stdin.resume(); process.stdin.on('end', () => {
      process.send({ type: 'failed', message: 'original application failure' });
    }); process.on('message', () => {});`,
    ],
    cwd: directory,
    env: process.env,
    spec: {},
    signal: AbortSignal.timeout(5000),
    preparationLog: join(directory, "preparation.log"),
    servicesLog: join(directory, "services.log"),
    redact: (value) => value,
    redactions: [],
  })
  try {
    const failure = await session.ready.catch((error: Error) => error)
    expect((failure as Error).message).toContain("original application failure")
    expect((failure as Error).message).toContain("Log persistence failed")
    expect((failure as Error).message).toContain("EISDIR")
  } finally {
    await expect(session.terminate()).rejects.toMatchObject({ code: "EISDIR" })
    await rm(directory, { recursive: true, force: true })
  }
})
