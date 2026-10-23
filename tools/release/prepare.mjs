import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { selectReleaseVersion } from "./version.mjs"

export function prepareRelease(cwd) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
  assert.equal(git("status", "--porcelain"), "", "Release preparation requires a clean checkout")
  git("fetch", "origin", "main", "--tags")
  git("checkout", "--detach", "origin/main")
  const manifestPath = `${cwd}/app/server/package.json`
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const head = git("rev-parse", "HEAD")
  const tag = `v${manifest.version}`
  const tags = git("tag", "--list").split("\n").filter(Boolean)
  const alreadyTagged = tags.includes(tag) && git("rev-parse", `${tag}^{commit}`) === head
  const version = alreadyTagged ? manifest.version : selectReleaseVersion(manifest.version, tags)
  // Validate tagged versions too: automatic main releases never publish prereleases.
  selectReleaseVersion(version, [])
  if (version !== manifest.version) {
    manifest.version = version
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    git("add", "app/server/package.json")
    git(
      "-c",
      "user.name=github-actions[bot]",
      "-c",
      "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-m",
      `chore: release v${version}`,
    )
    // A concurrent human push must fail rather than overwrite newer main work.
    git("push", "origin", "HEAD:refs/heads/main")
  }
  return { version, commit: git("rev-parse", "HEAD") }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    "wo658/redpact",
    "Release only from the public repository",
  )
  assert.equal(process.env.GITHUB_REF, "refs/heads/main", "Automatic releases require main")
  const result = prepareRelease(process.cwd())
  for (const [name, value] of Object.entries(result)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
  }
  console.log(JSON.stringify(result))
}
