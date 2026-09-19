import { randomUUID } from "node:crypto"
import { execa } from "execa"
import { expect, test } from "vitest"
import { executeLimitedContainer } from "../src/adapters/environment/limited-command.js"

const dockerTest = test.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")
dockerTest.each([
  ["정상 종료", "printf done", 5, null],
  ["동기 무한 루프", "node -e 'while(true){}'", 1, "Time limit exceeded"],
  [
    "메모리 폭증",
    "node -e 'globalThis.b=Buffer.alloc(128*1024*1024,1); setInterval(()=>{},1000)' ; sleep 20",
    10,
    "Memory limit exceeded",
  ],
] as const)(
  "컨테이너 %s에 메모리와 전체 실행 시간 한도를 적용한다",
  async (_name, source, timeoutSeconds, error) => {
    const name = `redpact-limits-${randomUUID()}`
    const docker = (args: string[]) => execa("docker", args, { timeout: 15000 })
    await docker([
      "run",
      "-d",
      "--name",
      name,
      "--memory",
      "64m",
      "--memory-swap",
      "64m",
      "node:24-bookworm-slim",
      "sleep",
      "60",
    ])
    try {
      const result = await executeLimitedContainer(
        name,
        ["/bin/sh", "-c", source],
        new AbortController().signal,
        { memoryMiB: 64, timeoutSeconds },
      )
      const [container] = JSON.parse((await docker(["inspect", name])).stdout)
      expect(container.HostConfig.Memory).toBe(64 * 1024 * 1024)
      expect(container.HostConfig.MemorySwap).toBe(container.HostConfig.Memory)
      if (error) {
        expect(result.outcome).toBe("execution_error")
        expect(result.error).toContain(error)
        expect(container.State.Running).toBe(false)
        expect(result.resourceLimit).toMatchObject({
          kind: error.startsWith("Time") ? "time" : "memory",
          source: error.startsWith("Time") ? "wall_clock" : "docker_oom",
          limits: { memoryMiB: 64, timeoutSeconds },
          observedMiB: null,
          termination: { target: "container", confirmed: true, signal: null },
        })
      } else {
        expect(result.outcome).toBe("command_succeeded")
        expect(result.stdout).toBe("done")
        expect(result.error).toBeNull()
        expect(result.resourceLimit).toBeUndefined()
      }
    } finally {
      await docker(["rm", "-fv", name])
    }
  },
  20000,
)
