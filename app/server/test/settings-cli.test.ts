import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
test.each(["describe", "validate"])(
  "removed settings %s command directs agents to configure",
  (action) => {
    const result = spawnSync(process.execPath, [cli, "settings", action], { encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("configure MCP tool")
  },
)
