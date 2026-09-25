import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
export const tarball = fileURLToPath(
  new URL(`../../../dist/redpact-${manifest.version}.tgz`, import.meta.url),
)
const evidence = new URL("../../../dist/runtime-artifact.json", import.meta.url)

export function verifyIdentity(actual, expected) {
  assert.equal(actual.version, expected.version, "Artifact version mismatch")
  assert.equal(actual.commit, expected.commit, "Artifact commit mismatch")
  assert.equal(actual.sha256, expected.sha256, "Artifact checksum mismatch")
}

export async function artifactIdentity() {
  assert(process.env.GITHUB_SHA, "GITHUB_SHA is required to identify the release source")
  if (process.env.GITHUB_REF_TYPE === "tag") {
    assert.equal(
      process.env.GITHUB_REF_NAME,
      `v${manifest.version}`,
      "Release tag/version mismatch",
    )
  }
  return {
    version: manifest.version,
    commit: process.env.GITHUB_SHA,
    sha256: createHash("sha256")
      .update(await readFile(tarball))
      .digest("hex"),
  }
}

export async function verifyArtifact() {
  const actual = await artifactIdentity()
  verifyIdentity(actual, JSON.parse(await readFile(evidence, "utf8")))
  console.log(JSON.stringify(actual))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "record") {
    await writeFile(evidence, `${JSON.stringify(await artifactIdentity(), null, 2)}\n`)
  } else {
    assert.equal(process.argv[2], "verify", "Expected record or verify")
    await verifyArtifact()
  }
}
