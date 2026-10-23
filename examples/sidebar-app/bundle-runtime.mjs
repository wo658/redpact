import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Produce a platform-specific plugin; runtime downloads happen only at build time.
if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("This plugin artifact currently targets macOS arm64 only")
}
const target = fileURLToPath(
  new URL("dist/redpact-marketplace/plugins/redpact-app/", import.meta.url),
)
const stage = await mkdtemp(join(tmpdir(), "redpact-plugin-node-"))
try {
  const version = "24.22.1"
  const filename = `node-v${version}-darwin-arm64.tar.gz`
  const base = `https://nodejs.org/dist/v${version}/`
  const checksums = await fetch(`${base}SHASUMS256.txt`)
  if (!checksums.ok) {
    throw new Error("Cannot load official Node checksums")
  }
  const checksum = (await checksums.text())
    .split("\n")
    .find((line) => line.endsWith(`  ${filename}`))
    ?.split(" ")[0]
  if (!checksum) {
    throw new Error("Official Node checksum is missing")
  }
  const response = await fetch(`${base}${filename}`)
  if (!response.ok) {
    throw new Error("Cannot download official Node runtime")
  }
  const archive = Buffer.from(await response.arrayBuffer())
  if (createHash("sha256").update(archive).digest("hex") !== checksum) {
    throw new Error("Node checksum mismatch")
  }
  await writeFile(join(stage, filename), archive)
  execFileSync("/usr/bin/tar", ["-xzf", join(stage, filename), "-C", stage])
  await mkdir(join(target, "bin"), { recursive: true })
  await cp(join(stage, `node-v${version}-darwin-arm64/bin/node`), join(target, "bin/node"))
  await chmod(join(target, "bin/node"), 0o755)
  await cp(join(stage, `node-v${version}-darwin-arm64/LICENSE`), join(target, "bin/NODE-LICENSE"))
  await rm(join(target, "runtime"), { recursive: true, force: true })
  await mkdir(join(target, "tooling"), { recursive: true })
  await rm(join(target, "tooling/npm"), { recursive: true, force: true })
  await cp(
    join(stage, `node-v${version}-darwin-arm64/lib/node_modules/npm`),
    join(target, "tooling/npm"),
    { recursive: true },
  )
  await writeFile(
    join(target, "tooling/package.json"),
    JSON.stringify({ private: true, name: "redpact-app-package-managers" }),
  )
  execFileSync(
    join(target, "bin/node"),
    [
      join(target, "tooling/npm/bin/npm-cli.js"),
      "install",
      "--prefix",
      join(target, "tooling"),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--save-exact",
      "--registry=https://registry.npmjs.org",
      "pnpm@11.2.2",
    ],
    { stdio: "inherit" },
  )
  // npm pack excludes nested node_modules; keep the self-contained pnpm CLI outside it.
  await rm(join(target, "tooling/pnpm"), { recursive: true, force: true })
  await cp(join(target, "tooling/node_modules/pnpm"), join(target, "tooling/pnpm"), {
    recursive: true,
  })
  await rm(join(target, "tooling/node_modules"), { recursive: true, force: true })
  await writeFile(
    join(target, "runtime-artifact.json"),
    `${JSON.stringify({ platform: process.platform, arch: process.arch, node: version, nodeSha256: checksum, redpact: "installed on demand", pnpm: "11.2.2" }, null, 2)}\n`,
  )
  console.log(`Bundled runtime: ${target}`)
} finally {
  await rm(stage, { recursive: true, force: true })
}
