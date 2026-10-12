import { expect, test } from "vitest"
import { instanceSettingsSchema } from "../src/core/instance-schema.js"

test("GitHub CLI 경로는 전역 설정에서 선택적으로 지정하고 절대 경로만 허용한다", () => {
  expect(
    instanceSettingsSchema.safeParse({ github: { cliPath: "/opt/homebrew/bin/gh" } }).success,
  ).toBe(true)
  expect(instanceSettingsSchema.safeParse({ github: { cliPath: "./gh" } }).success).toBe(false)
  expect(instanceSettingsSchema.safeParse({ github: { token: "secret" } }).success).toBe(false)
  expect(instanceSettingsSchema.parse({}).github).toBeUndefined()
})

test.skipIf(process.platform === "win32")(
  "저장된 CLI 경로 변경은 다음 연결 확인에서 바로 사용된다",
  async () => {
    const { mkdtemp, writeFile, chmod, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { createGitHubPullRequests } = await import("../src/adapters/github/pull-requests.js")
    const root = await mkdtemp(join(tmpdir(), "redpact-gh-settings-"))
    try {
      const first = join(root, "gh-first")
      const second = join(root, "gh-second")
      await writeFile(first, "#!/bin/sh\nprintf '%s\\n' first-user\n")
      await writeFile(second, "#!/bin/sh\nprintf '%s\\n' second-user\n")
      await chmod(first, 0o755)
      await chmod(second, 0o755)
      let cliPath = first
      const adapter = createGitHubPullRequests(undefined, async () => cliPath)
      expect(await adapter.connection()).toEqual({ login: "first-user", cliPath: first })
      cliPath = second
      expect(await adapter.connection()).toEqual({ login: "second-user", cliPath: second })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
