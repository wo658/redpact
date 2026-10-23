import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export function ensureReleaseTag(cwd, expectedCommit) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
  const { version } = JSON.parse(readFileSync(`${cwd}/app/server/package.json`, "utf8"))
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Stable release required")
  assert.equal(git("rev-parse", "HEAD"), expectedCommit, "Release source mismatch")
  const tag = `v${version}`
  const refs = git("ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
  if (refs.length) {
    const target = refs.find(([, ref]) => ref.endsWith("^{}")) ?? refs[0]
    assert.equal(target[0], expectedCommit, "Published tags are immutable")
    return tag
  }
  // Creating a new ref without force makes a competing/different tag fail safely.
  git("push", "origin", `${expectedCommit}:refs/tags/${tag}`)
  return tag
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    "wo658/redpact",
    "Release only from the public repository",
  )
  console.log(ensureReleaseTag(process.cwd(), process.env.RELEASE_SHA))
}
