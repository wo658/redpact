import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { tarball, verifyArtifact } from "../../app/server/tools/runtime-artifact.mjs"

export function checkPublishedIntegrity(metadata, integrity) {
  assert.equal(
    metadata.dist?.integrity,
    integrity,
    "Published version has different immutable contents",
  )
}

export async function publishVerifiedRuntime() {
  await verifyArtifact()
  const { version } = JSON.parse(
    await readFile(new URL("../../app/server/package.json", import.meta.url), "utf8"),
  )
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "Automatic publication requires a stable version",
  )
  const integrity = `sha512-${createHash("sha512")
    .update(await readFile(tarball))
    .digest("base64")}`
  const url = `https://registry.npmjs.org/@wo658%2Fredpact/${version}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (response.ok) {
    checkPublishedIntegrity(await response.json(), integrity)
    console.log(`@wo658/redpact@${version} is already published with this verified tarball`)
    return
  }
  assert.equal(response.status, 404, `Registry preflight returned HTTP ${response.status}`)
  execFileSync("node", ["app/server/tools/publish-runtime.mjs"], { stdio: "inherit" })
  // npm processing is asynchronous; verify immutable registry contents before success.
  for (let attempt = 0; attempt < 30; attempt++) {
    const published = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (published.ok) {
      checkPublishedIntegrity(await published.json(), integrity)
      console.log(`Registry verified @wo658/redpact@${version}`)
      return
    }
    assert.equal(published.status, 404, `Registry verification returned HTTP ${published.status}`)
    await new Promise((resolve) => setTimeout(resolve, 10000))
  }
  throw new Error(`Published package was not visible after five minutes: ${version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    "wo658/redpact",
    "Release only from the public repository",
  )
  await publishVerifiedRuntime()
}
