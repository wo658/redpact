import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } })
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
const tarball = fileURLToPath(
  new URL(`../../../dist/redpact-${manifest.version}.tgz`, import.meta.url),
)
const args = ["publish", tarball, "--access", "public", "--registry", "https://registry.npmjs.org/"]
if (values["dry-run"]) {
  args.push("--dry-run")
}
execFileSync("npm", args, { stdio: "inherit" })
