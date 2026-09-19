import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { parse } from "yaml"

const installation = vi.hoisted(() => ({ workspace: undefined as unknown }))

vi.mock("node:child_process", () => ({
  execFileSync: (_command: string, args: string[], options: { cwd: string }) => {
    if (args[0] === "install") {
      installation.workspace = parse(readFileSync(join(options.cwd, "pnpm-workspace.yaml"), "utf8"))
    }
    return ""
  },
}))

test("runtime packaging preserves the repository's reviewed release-age exceptions", async () => {
  const workspace = parse(
    readFileSync(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8"),
  )
  const argv = process.argv
  process.argv = argv.slice(0, 2)
  try {
    const script = new URL("../tools/pack-runtime.mjs", import.meta.url).href
    await import(script)
    expect(installation.workspace).toMatchObject({
      minimumReleaseAgeExclude: workspace.minimumReleaseAgeExclude,
    })
  } finally {
    process.argv = argv
  }
})
