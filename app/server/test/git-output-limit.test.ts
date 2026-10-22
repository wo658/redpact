import { execFileSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { readCommitDiff } from "../src/adapters/git/commit-diff.js"
import { readDiff } from "../src/adapters/git/diff.js"
import { readGit } from "../src/adapters/git/native-read.js"
import { gitOutputLimitMiB } from "../src/adapters/git/output-limit.js"
import { createGitStatus } from "../src/adapters/git/status.js"

afterEach(() => vi.unstubAllEnvs())

test("기본 한도에서 4 MiB를 넘는 Git 조회와 작업 트리 및 커밋 diff를 표시한다", async () => {
  vi.stubEnv("REDPACT_GIT_MAX_BUFFER_MIB", undefined)
  expect(gitOutputLimitMiB()).toBe(128)
  const root = await mkdtemp(join(tmpdir(), "redpact-git-limit-"))
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, "-c", "core.hooksPath=/dev/null", ...args], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim()
  try {
    git("init", "-q")
    const content = "large tracked line\n".repeat(300000)
    await writeFile(join(root, "large.txt"), content)
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "large")
    const revision = git("rev-parse", "HEAD")
    await expect(readGit(root, ["show", "HEAD:large.txt"])).resolves.toBe(content)
    const commit = await readCommitDiff(root, revision)
    expect(commit.patch.length).toBeGreaterThan(4 * 1024 * 1024)
    await writeFile(join(root, "large.txt"), "changed tracked line\n".repeat(300000))
    const snapshot = await createGitStatus().inspect(root)
    const diff = await readDiff(snapshot, "all")
    expect(diff.available).toBe(true)
    expect(diff.patch.length).toBeGreaterThan(4 * 1024 * 1024)

    vi.stubEnv("REDPACT_GIT_MAX_BUFFER_MIB", "1")
    await expect(readGit(root, ["show", "HEAD:large.txt"])).rejects.toMatchObject({
      code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    })
    const limited = await readCommitDiff(root, revision)
    expect(limited.patchOmitted).toBe("size_limit")
    expect(limited.omitted).toEqual([
      "Patch exceeds the 1 MiB display limit. Only changed file paths are shown.",
    ])
    expect((await readDiff(snapshot, "all")).available).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.each(["0", "-1", "1.5", "invalid", "2049", ""])(
  "잘못된 Git 출력 상한 %s를 거부한다",
  async (value) => {
    vi.stubEnv("REDPACT_GIT_MAX_BUFFER_MIB", value)
    await expect(readGit(process.cwd(), ["--version"])).rejects.toThrow(
      "REDPACT_GIT_MAX_BUFFER_MIB must be an integer from 1 to 2048",
    )
  },
)
