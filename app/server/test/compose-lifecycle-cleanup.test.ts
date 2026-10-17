import { createRequire } from "node:module"
import { getComposeClient } from "testcontainers"
import { expect, it, vi } from "vitest"

it("Compose 시작 실패 시 삭제 전에 로그를 수집하며 원래 실패를 유지한다", async () => {
  const require = createRequire(import.meta.url)
  const compose = createRequire(require.resolve("testcontainers"))("docker-compose").default
  const events: string[] = []
  const up = vi.spyOn(compose, "upAll").mockRejectedValue(new Error("application startup failed"))
  const down = vi.spyOn(compose, "down").mockImplementation(async () => {
    events.push("down")
  })
  try {
    const client = await getComposeClient(process.env)
    await expect(
      client.up({
        filePath: "/tmp",
        files: "compose.yaml",
        projectName: "diagnostic-order",
        beforeCleanup: async () => {
          events.push("logs")
          throw new Error("log unavailable")
        },
      } as Parameters<typeof client.up>[0]),
    ).rejects.toThrow("application startup failed")
    expect(events).toEqual(["logs", "down"])
  } finally {
    up.mockRestore()
    down.mockRestore()
  }
})
