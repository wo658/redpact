import { GenericContainer } from "testcontainers"
import { expect, test } from "vitest"
import { executeLimitedContainer } from "../src/adapters/environment/limited-command.js"

test.runIf(process.env.REDPACT_DOCKER_TESTS === "1")(
  "명령이 종료되기 전에 Testcontainers 출력 콜백으로 실패 진단을 전달한다",
  async () => {
    const container = await new GenericContainer("alpine:3.21")
      .withEntrypoint(["/bin/sh", "-c"])
      .withCommand(["sleep 60"])
      .start()
    let resolveOutput: (value: string) => void = () => {}
    const observed = new Promise<string>((resolve) => {
      resolveOutput = resolve
    })
    const abort = new AbortController()
    let finished = false
    const command = executeLimitedContainer(
      container.getId(),
      ["/bin/sh", "-c", "echo live-failure-marker >&2; sleep 10"],
      abort.signal,
      { memoryMiB: 128, timeoutSeconds: 30 },
      (output) => {
        if (output.stderr.includes("live-failure-marker")) {
          resolveOutput(output.stderr)
        }
      },
    ).finally(() => {
      finished = true
    })
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const firstOutput = await Promise.race([
        observed,
        new Promise<string>((resolve) => {
          timeout = setTimeout(() => resolve("missing live output"), 5000)
        }),
      ])
      expect(firstOutput).toContain("live-failure-marker")
      expect(finished).toBe(false)
    } finally {
      clearTimeout(timeout)
      abort.abort()
      await command
      await container.stop()
    }
  },
  60000,
)
