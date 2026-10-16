import { expect, test, vi } from "vitest"
import { readCommitDiff } from "../src/adapters/git/commit-diff.js"
import { readGit } from "../src/adapters/git/native-read.js"

vi.mock("../src/adapters/git/native-read.js", () => ({ readGit: vi.fn() }))

const revision = "a".repeat(40)
const baseRevision = "b".repeat(40)
const overflow = () =>
  Object.assign(new Error("stdout maxBuffer length exceeded"), {
    code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    stdout: "complete-path.txt\0truncated-pat",
  })

test("파일 목록도 제한을 넘으면 부분 경로를 완전한 목록으로 표시하지 않고 메타데이터를 보존한다", async () => {
  vi.mocked(readGit)
    .mockReset()
    .mockResolvedValueOnce("commit\n")
    .mockResolvedValueOnce(`${baseRevision}\n`)
    .mockRejectedValueOnce(overflow())
    .mockRejectedValueOnce(overflow())
  await expect(readCommitDiff("/repo", revision)).resolves.toEqual({
    available: true,
    revision,
    baseRevision,
    patch: "",
    patchOmitted: "size_limit",
    changedPathsOmitted: "size_limit",
    omitted: [
      "Patch and file list exceed their 4 MiB display limits. Only commit metadata is shown.",
    ],
  })
  expect(vi.mocked(readGit).mock.calls[3]?.[1]).toContain("--name-only")
})

test("파일 목록의 크기 제한 외 Git 오류는 성공으로 숨기지 않는다", async () => {
  const failure = Object.assign(new Error("repository unavailable"), { code: 128 })
  vi.mocked(readGit)
    .mockReset()
    .mockResolvedValueOnce("commit\n")
    .mockResolvedValueOnce(`${baseRevision}\n`)
    .mockRejectedValueOnce(overflow())
    .mockRejectedValueOnce(failure)
  await expect(readCommitDiff("/repo", revision)).rejects.toBe(failure)
})
