import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { readPluginSource } from "./check-release.mjs"

export function verifyPluginArtifact(actual, expected) {
  for (const key of ["version", "commit", "sha256", "filename"]) {
    assert.equal(actual[key], expected[key], `Plugin artifact ${key} mismatch`)
  }
}

export function pluginPublishCommand(tarball, dryRun) {
  if (dryRun) {
    return ["pack", tarball, "--dry-run", "--ignore-scripts"]
  }
  return ["publish", tarball, "--access", "public", "--tag", "latest"]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert(process.env.GITHUB_SHA, "GITHUB_SHA is required to identify the verified source")
  const source = await readPluginSource()
  const dist = new URL("../../examples/sidebar-app/dist/", import.meta.url)
  const artifact = JSON.parse(await readFile(new URL("plugin-artifact.json", dist), "utf8"))
  const filename = `wo658-redpact-plugin-${source.version}.tgz`
  const tarball = new URL(filename, dist)
  verifyPluginArtifact(artifact, {
    filename,
    version: source.version,
    commit: process.env.GITHUB_SHA,
    sha256: createHash("sha256")
      .update(await readFile(tarball))
      .digest("hex"),
  })
  const args = pluginPublishCommand(fileURLToPath(tarball), process.argv.includes("--dry-run"))
  execFileSync("npm", args, { stdio: "inherit" })
}
