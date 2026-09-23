import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { expect, test } from "vitest"

const { migrationFixture } = await import(
  new URL("../../../e2e/tests/migration-fixture.ts", import.meta.url).href
)

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
test.each(["legacy", "resume"])(
  "migrates %s state before serving and keeps original evidence",
  async (scenario) => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      "--input-type=module",
      "-e",
      migrationFixture,
      JSON.stringify({ scenario, cli }),
    ])
    const result = JSON.parse(stdout)
    expect(result.first.status, result.first.output).toBe(200)
    expect(result.backup).toBe(result.original)
    expect(JSON.parse(result.log ?? "null")).toEqual(["001-fixed-environment-settings"])
    expect(result.second?.status).toBe(200)
    expect(result.unchangedAfterRestart).toBe(true)
    expect(result.settingsUnchanged).toBe(true)
    expect(result.locked).toBe(false)
  },
)
test.each(["invalid", "future"])(
  "rejects %s state without changing originals",
  async (scenario) => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      "--input-type=module",
      "-e",
      migrationFixture,
      JSON.stringify({ scenario, cli }),
    ])
    const result = JSON.parse(stdout)
    expect(result.first.code).toBe(1)
    expect(result.first.output).toContain(
      scenario === "future"
        ? "Unsupported runtime migration history"
        : "Missing captured dependency selection",
    )
    expect(result.after).toBe(result.original)
    expect(result.locked).toBe(false)
  },
)
