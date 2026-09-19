import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const website = resolve(process.env.REDPACT_WEB_ROOT ?? resolve(root, "../redpact-web"))
const command = process.argv[2]
if (!["build", "dev", "preview", "test:preview"].includes(command)) {
  throw new Error("Expected build, dev, preview or test:preview")
}
if (!existsSync(resolve(website, "source.config.ts"))) {
  throw new Error(
    "Documentation rendering belongs to redpact-web. Set REDPACT_WEB_ROOT to its checkout and install its dependencies; docs:check works without it.",
  )
}
const result = spawnSync("pnpm", ["run", `docs:${command}`], {
  cwd: website,
  stdio: "inherit",
  env: { ...process.env, REDPACT_DOCS_DIR: resolve(root, "docs") },
})
if (result.error) {
  throw result.error
}
process.exit(result.status ?? 1)
