import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { nodeArchiveCommand, runPnpm } from "../../server/tools/runtime-commands.mjs"

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const root = resolve(desktop, "../..")
const nodeVersion = "24.20.0"
const platforms = { darwin: "darwin", linux: "linux", win32: "win" }
const platform = platforms[process.platform]
if (!platform || !["arm64", "x64"].includes(process.arch)) {
  throw new Error(`Unsupported desktop host: ${process.platform}/${process.arch}`)
}
const target = process.env.TAURI_ENV_TARGET_TRIPLE
const expectedOs = { darwin: "apple-darwin", linux: "unknown-linux", win32: "pc-windows" }[
  process.platform
]
const expectedArch = process.arch === "arm64" ? "aarch64" : "x86_64"
if (target && (!target.startsWith(expectedArch) || !target.includes(expectedOs))) {
  throw new Error(
    "Prepare the runtime on a host matching the Tauri target; cross-packaging is not supported",
  )
}
const archiveName = `node-v${nodeVersion}-${platform}-${process.arch}.${process.platform === "win32" ? "zip" : "tar.gz"}`
const baseUrl = `https://nodejs.org/dist/v${nodeVersion}/`
const cache = join(desktop, "node_modules/.redpact/cache")
await mkdir(cache, { recursive: true })
async function download(name) {
  const response = await fetch(new URL(name, baseUrl))
  if (!response.ok) {
    throw new Error(`Node download failed: ${response.status} ${name}`)
  }
  return Buffer.from(await response.arrayBuffer())
}
const sums = (await download("SHASUMS256.txt")).toString()
const digest = sums
  .split("\n")
  .find((line) => line.endsWith(`  ${archiveName}`))
  ?.split(" ")[0]
if (!digest || !/^[a-f0-9]{64}$/.test(digest)) {
  throw new Error("Official Node checksum is missing")
}
const archive = join(cache, archiveName)
let bytes = await readFile(archive).catch(() => undefined)
if (!bytes || createHash("sha256").update(bytes).digest("hex") !== digest) {
  bytes = await download(archiveName)
  if (createHash("sha256").update(bytes).digest("hex") !== digest) {
    throw new Error("Node archive checksum mismatch")
  }
  await writeFile(archive, bytes)
}
const staged = join(desktop, "node_modules/.redpact/runtime.next")
await rm(staged, { recursive: true, force: true })
try {
  await mkdir(join(staged, "bin"), { recursive: true })
  const extracted = join(cache, `node-v${nodeVersion}-${platform}-${process.arch}`)
  execFileSync(nodeArchiveCommand(), ["-xf", archive, "-C", cache])
  const binary = process.platform === "win32" ? "node.exe" : "bin/node"
  const installed = join(staged, "bin", process.platform === "win32" ? "node.exe" : "node")
  await cp(join(extracted, binary), installed)
  await chmod(installed, 0o755)
  await cp(join(extracted, "LICENSE"), join(staged, "NODE-LICENSE"))
  const run = (args) => runPnpm(args, { cwd: root, stdio: "inherit" })
  run(["--filter", "@redpact/web", "build"])
  run(["--filter", "@redpact/server", "build"])
  execFileSync(
    process.execPath,
    ["app/server/tools/pack-runtime.mjs", "--directory", join(staged, "server")],
    { cwd: root, stdio: "inherit" },
  )
  await writeFile(
    join(staged, "provenance.json"),
    `${JSON.stringify({ nodeVersion, archiveName, sha256: digest, platform: process.platform, arch: process.arch }, null, 2)}\n`,
  )
  await rm(join(desktop, "node_modules/.redpact/runtime"), { recursive: true, force: true })
  await rename(staged, join(desktop, "node_modules/.redpact/runtime"))
} finally {
  await rm(staged, { recursive: true, force: true })
}
