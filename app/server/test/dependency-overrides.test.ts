import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createSettingsService, readJsonSettings } from "../src/adapters/settings/json.js"

test("모든 워크트리는 공통 설정을 쓰고 실행 경로는 자신의 체크아웃에 둔다", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixed-project-settings-"))
  try {
    const primary = join(root, "primary"),
      target = join(root, "target")
    for (const path of [primary, target]) {
      await mkdir(join(path, ".redpact"), { recursive: true })
    }
    const source = JSON.stringify({
      composeFiles: ["compose.yaml"],
      services: ["app"],
      tests: { env: { VALUE: "shared" } },
    })
    await writeFile(join(primary, ".redpact/settings.json"), source)
    await writeFile(join(target, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
    await writeFile(join(target, ".redpact/settings.json"), "invalid local settings")
    await writeFile(join(target, ".redpact/dependencies.override.json"), "invalid retired overlay")
    const result = await createSettingsService(target, primary).read()
    expect(result.valid, JSON.stringify(result.issues)).toBe(true)
    expect(result.plan?.activeServices).toEqual(["app"])
    expect(result.settings?.tests.env).toEqual({ VALUE: "shared" })
    expect(result).not.toHaveProperty("promotion")
    expect(result.projectRules?.source).toBe(source)
    expect((await readJsonSettings(target, undefined, result.projectRules)).digest).toBe(
      result.digest,
    )
    expect(await readFile(join(primary, ".redpact/settings.json"), "utf8")).toBe(source)
    await writeFile(join(target, "compose.yaml"), "services:\n  other:\n    image: alpine:3.21\n")
    expect((await createSettingsService(target, primary).read()).valid).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
