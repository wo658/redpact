import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
test.each(["describe", "validate"])("settings %s requires an explicit settings scope", (action) => {
  const result = spawnSync(process.execPath, [cli, "settings", action], { encoding: "utf8" })
  expect(result.status).toBe(2)
  expect(result.stdout).toBe("")
  expect(result.stderr).toContain("Invalid command or option")
})
