import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const root = new URL("./", import.meta.url)
const target = new URL("dist/redpact-marketplace/plugins/redpact-app/", root)
await mkdir(new URL("dist", root), { recursive: true })
const packed = JSON.parse(
  execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      fileURLToPath(new URL("dist", root)),
    ],
    { cwd: target, encoding: "utf8" },
  ),
)[0]
const tarball = await readFile(new URL(`dist/${packed.filename}`, root))
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
await writeFile(
  new URL("dist/plugin-artifact.json", root),
  `${JSON.stringify({ filename: packed.filename, version: packed.version, commit, sha256: createHash("sha256").update(tarball).digest("hex") }, null, 2)}\n`,
)
console.log(packed.filename)
