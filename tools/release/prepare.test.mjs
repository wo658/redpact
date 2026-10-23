import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { prepareRelease } from "./prepare.mjs"
import { checkPublishedIntegrity } from "./publish.mjs"
import { ensureReleaseTag } from "./tag.mjs"

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "redpact-release-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const remote = join(root, "origin.git")
  const cwd = join(root, "checkout")
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" })
  execFileSync("git", ["clone", remote, cwd], { stdio: "pipe" })
  const git = (...args) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  git("config", "user.name", "Test")
  git("config", "user.email", "test@example.com")
  git("checkout", "-b", "main")
  mkdirSync(join(cwd, "app/server"), { recursive: true })
  const manifestPath = join(cwd, "app/server/package.json")
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ name: "@redpact/server", version: "0.10.0" }, null, 2)}\n`,
  )
  git("add", ".")
  git("commit", "-m", "initial")
  git("tag", "v0.10.0")
  git("push", "origin", "main", "--tags")
  return { cwd, git, manifestPath }
}

test("main은 버전을 커밋하고 정확한 SHA에 태그를 만들며 재시도는 같은 릴리스를 보존한다", (t) => {
  const { cwd, git, manifestPath } = fixture(t)
  writeFileSync(join(cwd, "feature"), "feature\n")
  git("add", ".")
  git("commit", "-m", "feature")
  git("push", "origin", "main")
  const release = prepareRelease(cwd)
  assert.equal(release.version, "0.10.1")
  assert.equal(JSON.parse(readFileSync(manifestPath, "utf8")).version, "0.10.1")
  assert.equal(git("ls-remote", "origin", "refs/heads/main").split(/\s+/)[0], release.commit)
  assert.equal(ensureReleaseTag(cwd, release.commit), "v0.10.1")
  assert.equal(ensureReleaseTag(cwd, release.commit), "v0.10.1")
  assert.deepEqual(prepareRelease(cwd), release)
  writeFileSync(join(cwd, "next-feature"), "next feature\n")
  git("add", ".")
  git("commit", "-m", "next feature")
  git("push", "origin", "HEAD:refs/heads/main")
  assert.equal(prepareRelease(cwd).version, "0.10.2")
})

test("버전이 선반영된 main은 추가 커밋 없이 배포하고 기존 태그는 이동하지 않는다", (t) => {
  const { cwd, git, manifestPath } = fixture(t)
  writeFileSync(manifestPath, `${JSON.stringify({ version: "0.11.0" }, null, 2)}\n`)
  git("add", ".")
  git("commit", "-m", "prepare minor")
  git("push", "origin", "main")
  const expected = git("rev-parse", "HEAD")
  assert.deepEqual(prepareRelease(cwd), { version: "0.11.0", commit: expected })
  git("tag", "v0.11.0", "v0.10.0")
  git("push", "origin", "v0.11.0")
  assert.throws(() => ensureReleaseTag(cwd, expected), /immutable/)
  assert.throws(() => ensureReleaseTag(cwd, "different-sha"), /source mismatch/)
})

test("npm 재시도는 동일한 검증 tarball만 이미 게시된 것으로 인정한다", () => {
  assert.doesNotThrow(() =>
    checkPublishedIntegrity({ dist: { integrity: "sha512-same" } }, "sha512-same"),
  )
  assert.throws(
    () => checkPublishedIntegrity({ dist: { integrity: "sha512-other" } }, "sha512-same"),
    /immutable/,
  )
  assert.throws(() => checkPublishedIntegrity({}, "sha512-same"), /immutable/)
})
