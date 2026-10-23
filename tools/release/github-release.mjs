import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { ensureReleaseTag } from "./tag.mjs"

assert.equal(
  process.env.GITHUB_REPOSITORY,
  "wo658/redpact",
  "Release only from the public repository",
)
assert(process.env.GH_TOKEN, "GitHub release authentication is required")
const tag = ensureReleaseTag(process.cwd(), process.env.RELEASE_SHA)
const gh = (...args) => execFileSync("gh", args, { stdio: "inherit" })
const existing = await fetch(`https://api.github.com/repos/wo658/redpact/releases/tags/${tag}`, {
  headers: {
    Authorization: `Bearer ${process.env.GH_TOKEN}`,
    Accept: "application/vnd.github+json",
  },
  signal: AbortSignal.timeout(30000),
})
if (existing.ok) {
  const release = await existing.json()
  assert.equal(release.tag_name, tag, "GitHub release tag mismatch")
  if (release.draft) {
    gh("release", "edit", tag, "--repo", "wo658/redpact", "--draft=false")
  }
  console.log(`GitHub release ${tag} already exists; preserving its notes`)
} else {
  assert.equal(existing.status, 404, `GitHub release lookup returned HTTP ${existing.status}`)
  const notesPath = `tools/release/notes/${tag}.md`
  const args = [
    "release",
    "create",
    tag,
    "--repo",
    "wo658/redpact",
    "--verify-tag",
    "--target",
    process.env.RELEASE_SHA,
    "--title",
    `Redpact ${tag} · Beta`,
    "--generate-notes",
  ]
  if (existsSync(notesPath)) {
    args.push("--notes-file", notesPath)
  } else {
    const run = `https://github.com/wo658/redpact/actions/runs/${process.env.GITHUB_RUN_ID}`
    args.push(
      "--notes",
      `## English\n\nVerified Ubuntu/Node 24 runtime snapshot. npm tarball integrity and installed-package checks passed. Other host environments and Docker execution require separate verification. See the commit list below for changes and compatibility notes.\n\n## 한국어\n\nUbuntu/Node 24에서 검증한 런타임 스냅샷입니다. npm tarball 무결성과 설치 패키지 검증을 통과했습니다. 다른 호스트 환경과 Docker 실행은 별도 검증이 필요합니다. 변경사항과 호환성 주의사항은 아래 커밋 목록을 확인하세요.\n\n[Verification / 검증 기록](${run})`,
    )
  }
  gh(...args)
}
