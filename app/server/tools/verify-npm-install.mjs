import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tarball, verifyArtifact } from "./runtime-artifact.mjs"

await verifyArtifact()
const directory = await mkdtemp(join(tmpdir(), "redpact-npm-verification-"))
const windows = process.platform === "win32"
const prefix = join(directory, "prefix")
const npm = windows ? process.execPath : "npm"
const npmArgs = windows ? [join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")] : []
try {
  const config = join(directory, "npmrc")
  await writeFile(config, "")
  const env = { ...process.env, NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_PREFIX: prefix }
  execFileSync(npm, [...npmArgs, "--version"], { env, stdio: "inherit" })
  execFileSync(
    npm,
    [
      ...npmArgs,
      "install",
      "--global",
      tarball,
      "--prefix",
      prefix,
      "--cache",
      join(directory, "cache"),
      "--ignore-scripts=false",
      "--include=optional",
      "--foreground-scripts",
      "--registry=https://registry.npmjs.org/",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: directory, env, stdio: "inherit", timeout: 600000 },
  )
  const installed = join(prefix, windows ? "node_modules" : "lib/node_modules", "@wo658/redpact")
  const expected = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
  const actual = JSON.parse(await readFile(join(installed, "package.json"), "utf8"))
  assert.equal(actual.version, expected.version)
  assert.equal(actual.name, "@wo658/redpact")
  // Windows .cmd shims require a shell; exercise their installed JS entry with Node.
  const executable = windows ? process.execPath : join(prefix, "bin/redpact")
  const args = windows ? [join(installed, "dist/cli.js")] : []
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL("../../../tools/install/smoke.mjs", import.meta.url)),
      executable,
      ...args,
    ],
    { cwd: directory, env, stdio: "inherit", timeout: 60000 },
  )
  console.log(
    `PASS: npm global install ${actual.version}; ${process.platform}/${process.arch}; Node ${process.version}`,
  )
} finally {
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }).catch(
    (error) => console.warn(`Unable to remove temporary npm verification directory: ${error}`),
  )
}
