import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { createGitService } from "../src/workflows/git.js"

let dir: string
const git = (...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim()
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "redpact-git-"))
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})
const service = () => createGitService(dir, createGitAdapter())

test("inspects unborn repositories and reports untracked changes", async () => {
  await writeFile(join(dir, "new.txt"), "new")
  expect(await service().inspect()).toMatchObject({
    available: true,
    revision: null,
    dirty: true,
    changes: [{ path: "new.txt" }],
  })
})
test("reads distinct HEAD and index content without mutating the index", async () => {
  await writeFile(join(dir, "file.txt"), "committed")
  git("add", ".")
  git("commit", "-qm", "initial")
  await writeFile(join(dir, "file.txt"), "staged")
  git("add", ".")
  await writeFile(join(dir, "file.txt"), "working")
  const index = await readFile(join(dir, ".git/index"))
  expect(await service().readFile("file.txt")).toBe("committed")
  expect(await service().readFile("file.txt", "index")).toBe("staged")
  expect(await service().inspect()).toMatchObject({
    available: true,
    revision: git("rev-parse", "HEAD"),
    dirty: true,
  })
  expect(await readFile(join(dir, ".git/index"))).toEqual(index)
  await expect(service().readFile("../escape")).rejects.toThrow("relative")
})
test("linked worktrees use private HEAD/index and common objects", async () => {
  await writeFile(join(dir, "file.txt"), "main")
  git("add", ".")
  git("commit", "-qm", "initial")
  const linked = join(dir, "linked")
  git("worktree", "add", "-q", "--detach", linked)
  const other = createGitService(linked, createGitAdapter())
  expect(await other.readFile("file.txt")).toBe("main")
  expect(await other.inspect()).toMatchObject({
    available: true,
    dirty: false,
    revision: git("rev-parse", "HEAD"),
  })
  await writeFile(join(linked, "file.txt"), "other")
  execFileSync("git", ["-C", linked, "add", "file.txt"])
  expect(await other.readFile("file.txt", "index")).toBe("other")
  expect(await service().readFile("file.txt", "index")).toBe("main")
})
test("non-repositories return explicit unavailable evidence", async () => {
  await rm(join(dir, ".git"), { recursive: true })
  expect(await service().inspect()).toMatchObject({ available: false })
})

test("diff separates staged and working changes and includes untracked text without changing the index", async () => {
  await writeFile(join(dir, "file.txt"), "committed\n")
  git("add", ".")
  git("commit", "-qm", "initial")
  await writeFile(join(dir, "file.txt"), "staged\n")
  git("add", ".")
  await writeFile(join(dir, "file.txt"), "working\n")
  await writeFile(join(dir, "new file.txt"), "new text\n")
  const index = await readFile(join(dir, ".git/index"))
  const all = await service().diff?.("all")
  expect(all?.patch).toContain("-committed")
  expect(all?.patch).toContain("+working")
  expect(all?.patch).toContain("+new text")
  const staged = await service().diff("staged")
  expect(staged.patch).toContain("+staged")
  expect(staged.patch).not.toContain("+working")
  const unstaged = await service().diff("unstaged")
  expect(unstaged.patch).toContain("-staged")
  expect(unstaged.patch).toContain("+working")
  expect(await readFile(join(dir, ".git/index"))).toEqual(index)
})

test("diff handles unborn, deleted and binary files in the correct linked checkout", async () => {
  await writeFile(join(dir, "first.txt"), "first\n")
  expect((await service().diff("all")).patch).toContain("+first")
  git("add", ".")
  git("commit", "-qm", "initial")
  const linked = join(dir, "linked")
  git("worktree", "add", "-q", "--detach", linked)
  await rm(join(linked, "first.txt"))
  await writeFile(join(linked, "binary.bin"), Buffer.from([0, 1, 2]))
  const other = createGitService(linked, createGitAdapter())
  const result = await other.diff("all")
  expect(result.available).toBe(true)
  expect(result.patch).toContain("-first")
  expect(result.patch).toContain("Binary files")
  expect((await service().diff("all")).patch).not.toContain("-first")
})

test.each([3, 4])(
  "reads index v%i, intent-to-add and linked staged blobs without rewriting metadata",
  async (version) => {
    await writeFile(join(dir, "file.txt"), "committed")
    git("add", ".")
    git("commit", "-qm", "initial")
    const linked = join(dir, "linked")
    git("worktree", "add", "-q", "--detach", linked)
    const run = (...args: string[]) =>
      execFileSync("git", ["-C", linked, ...args], { encoding: "utf8" })
    await writeFile(join(linked, "file.txt"), "staged")
    run("add", "file.txt")
    await writeFile(join(linked, "file.txt"), "committed")
    await writeFile(join(linked, "intent file.txt"), "new content")
    run("add", "-N", "intent file.txt")
    run("update-index", `--index-version=${version}`)
    const indexPath = run("rev-parse", "--git-path", "index").trim()
    const before = await readFile(indexPath)
    expect(before.readUInt32BE(4)).toBe(version)
    const other = createGitService(linked, createGitAdapter())
    expect(await other.inspect()).toMatchObject({
      available: true,
      dirty: true,
      changes: expect.arrayContaining([
        { path: "file.txt", head: 1, worktree: 1, stage: 3 },
        { path: "intent file.txt", head: 0, worktree: 2, stage: 3 },
      ]),
    })
    expect(await other.readFile("file.txt", "index")).toBe("staged")
    expect(await other.readFile("intent file.txt", "index")).toBe("")
    expect(await other.readFile("missing.txt", "index")).toBeNull()
    expect((await other.diff("staged")).patch).toContain("+staged")
    expect(await readFile(indexPath)).toEqual(before)
    expect(await service().readFile("file.txt", "index")).toBe("committed")
  },
)

test("review diff uses the merge base and includes committed and local changes after both branches advance", async () => {
  await writeFile(join(dir, "file.txt"), "original\n")
  git("add", ".")
  git("commit", "-qm", "base")
  git("branch", "local")
  const baseRevision = git("rev-parse", "HEAD")
  git("checkout", "-qb", "feature")
  await writeFile(join(dir, "file.txt"), "feature commit\n")
  git("add", ".")
  git("commit", "-qm", "feature")
  git("checkout", "-q", "local")
  await writeFile(join(dir, "base-only.txt"), "base advanced\n")
  git("add", ".")
  git("commit", "-qm", "base advance")
  git("checkout", "-q", "feature")
  const clean = await service().diff("all", "local")
  expect(clean.patch).toContain("+feature commit")
  expect(clean).toMatchObject({ available: true, baseRevision })
  expect(clean.patch).not.toContain("base-only.txt")
  await writeFile(join(dir, "staged.txt"), "staged addition\n")
  git("add", "staged.txt")
  await writeFile(join(dir, "file.txt"), "working edit\n")
  await writeFile(join(dir, "new.txt"), "untracked addition\n")
  const index = await readFile(join(dir, ".git/index"))
  const current = await service().diff("all", "local")
  expect(current.patch).toContain("-original")
  expect(current.patch).toContain("+working edit")
  expect(current.patch).toContain("+staged addition")
  expect(current.patch).toContain("+untracked addition")
  expect(current.patch).not.toContain("base-only.txt")
  expect(await readFile(join(dir, ".git/index"))).toEqual(index)
  expect((await service().diff("all", "missing")).baseRevision).toBe(baseRevision)
  expect((await service().diff("all", null)).baseRevision).toBe(baseRevision)
  git("reflog", "expire", "--expire=all", "refs/heads/feature")
  expect((await service().diff("all", "missing")).available).toBe(false)
  expect((await service().diff("all", null)).available).toBe(false)
})

test("review diff reports unrelated branch histories instead of an empty patch", async () => {
  await writeFile(join(dir, "file.txt"), "first")
  git("add", ".")
  git("commit", "-qm", "first")
  git("branch", "local")
  git("checkout", "--orphan", "unrelated")
  git("commit", "-qm", "unrelated")
  expect(await service().diff("all", "local")).toMatchObject({ available: false, patch: "" })
})
test("image comparison preserves bytes from the merge base and working checkout", async () => {
  const original = Buffer.from([137, 80, 78, 71, 0, 255, 128])
  const current = Buffer.from([137, 80, 78, 71, 0, 254, 129])
  await writeFile(join(dir, "picture.PNG"), original)
  git("add", ".")
  git("commit", "-qm", "image base")
  git("branch", "local")
  const baseRevision = git("rev-parse", "HEAD")
  git("checkout", "-qb", "feature")
  await writeFile(join(dir, "picture.PNG"), current)
  git("add", ".")
  git("commit", "-qm", "image change")
  const result = await service().image?.("picture.PNG", "local")
  expect(result).toMatchObject({
    baseRevision,
    before: { dataUrl: `data:image/png;base64,${original.toString("base64")}` },
    after: { dataUrl: `data:image/png;base64,${current.toString("base64")}` },
  })
})

test("image comparison distinguishes added, deleted, oversized and unsafe images", async () => {
  const { symlink } = await import("node:fs/promises")
  await writeFile(join(dir, "old.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  git("add", ".")
  git("commit", "-qm", "base")
  await rm(join(dir, "old.svg"))
  await writeFile(join(dir, "new.jpg"), Buffer.from([255, 216, 0, 255]))
  expect(await service().image?.("old.svg")).toMatchObject({ after: null })
  expect(await service().image?.("new.jpg")).toMatchObject({
    before: null,
    after: { dataUrl: expect.stringContaining("data:image/jpeg;base64,") },
  })
  await writeFile(join(dir, "large.png"), Buffer.alloc(5 * 1024 * 1024 + 1))
  expect(await service().image?.("large.png")).toMatchObject({
    after: { error: expect.stringContaining("5 MiB") },
  })
  await symlink(join(dir, "new.jpg"), join(dir, "link.png"))
  expect(await service().image?.("link.png")).toMatchObject({
    after: { error: expect.stringContaining("regular") },
  })
  await expect(service().image?.("../outside.png")).rejects.toThrow("relative")
})

test("image previews include larger untracked PNGs and keep linked checkout bytes separate", async () => {
  await writeFile(join(dir, "image.png"), Buffer.from([0, 1, 255]))
  git("add", ".")
  git("commit", "-qm", "base")
  const linked = join(dir, "linked")
  git("worktree", "add", "-q", "--detach", linked)
  await writeFile(join(linked, "image.png"), Buffer.from([0, 2, 254]))
  await writeFile(join(linked, "new image.png"), Buffer.alloc(600 * 1024))
  const indexPath = git("rev-parse", "--git-path", "index")
  const index = await readFile(join(dir, indexPath))
  const other = createGitService(linked, createGitAdapter())
  expect(await other.image("image.png")).toMatchObject({
    before: { dataUrl: "data:image/png;base64,AAH/" },
    after: { dataUrl: "data:image/png;base64,AAL+" },
  })
  expect(await service().image("image.png")).toMatchObject({
    after: { dataUrl: "data:image/png;base64,AAH/" },
  })
  const diff = await other.diff("all")
  expect(diff.available).toBe(true)
  expect(diff.omitted).toEqual([])
  expect(diff.patch).toContain("new image.png")
  expect(await readFile(join(dir, indexPath))).toEqual(index)
})

test.each([
  { linked: false, version: 2 },
  { linked: true, version: 2 },
  { linked: false, version: 4 },
  { linked: true, version: 4 },
])(
  "status follows Git exclude precedence (linked=$linked, index=$version)",
  async ({ linked, version }) => {
    const home = join(dir, ".git", "test-home")
    await mkdir(home)
    vi.stubEnv("HOME", home)
    vi.stubEnv("XDG_CONFIG_HOME", join(home, "config"))
    const globalIgnore = join(home, "global-ignore")
    await writeFile(globalIgnore, "*.global\n*.local\n*.tracked\n")
    await writeFile(join(home, ".gitconfig"), `[core]\n  excludesFile = ${globalIgnore}\n`)
    await writeFile(join(dir, ".gitignore"), "*.project\n!keep.local\n*.nested\n")
    await mkdir(join(dir, "nested"))
    await writeFile(join(dir, "nested/.gitignore"), "!keep.nested\n")
    await writeFile(join(dir, "file.tracked"), "committed\n")
    git("add", ".gitignore", "nested/.gitignore")
    git("add", "-f", "file.tracked")
    git("commit", "-qm", "initial")
    await writeFile(join(dir, ".git/info/exclude"), "*.local\n!keep.global\n")
    const root = linked ? join(dir, "linked") : dir
    if (linked) {
      git("worktree", "add", "-q", "--detach", root)
    }
    const run = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" })
    run("update-index", `--index-version=${version}`)
    const indexPath = run("rev-parse", "--path-format=absolute", "--git-path", "index").trim()
    const index = await readFile(indexPath)
    const paths = [
      "hidden.global",
      "hidden.local",
      "hidden.project",
      "hidden.nested",
      "keep.global",
      "keep.local",
      "nested/keep.nested",
      "new file\nname.txt",
    ]
    for (const path of paths) {
      await writeFile(join(root, path), "untracked\n")
    }
    await writeFile(join(root, "file.tracked"), "modified\n")
    const expected = [
      "file.tracked",
      "keep.global",
      "keep.local",
      "nested/keep.nested",
      "new file\nname.txt",
    ].sort()
    const nativePaths = run("status", "--porcelain=v1", "-z", "--untracked-files=all")
      .split("\0")
      .filter(Boolean)
      .map((record) => record.slice(3))
      .sort()
    expect(nativePaths).toEqual(expected)
    const current = createGitService(root, createGitAdapter())
    const result = await current.inspect()
    expect(result.available).toBe(true)
    if (!result.available) {
      throw new Error(result.reason)
    }
    expect(result.changes.map((change) => change.path).sort()).toEqual(expected)
    expect(result.changes.find((change) => change.path === "file.tracked")).toEqual({
      path: "file.tracked",
      head: 1,
      worktree: 2,
      stage: 1,
    })
    expect(await readFile(indexPath)).toEqual(index)
    for (const path of expected) {
      if (path !== "file.tracked") {
        await rm(join(root, path))
      }
    }
    await writeFile(join(root, "file.tracked"), "committed\n")
    expect(await current.inspect()).toMatchObject({ available: true, dirty: false, changes: [] })
  },
)

test("status rereads default XDG ignores and repository excludesFile overrides", async () => {
  const home = join(dir, ".git", "test-home")
  const config = join(home, "config")
  await mkdir(join(config, "git"), { recursive: true })
  vi.stubEnv("HOME", home)
  vi.stubEnv("XDG_CONFIG_HOME", config)
  await writeFile(join(config, "git/ignore"), "default.txt\n")
  await writeFile(join(dir, "default.txt"), "default\n")
  await writeFile(join(dir, "local.txt"), "local\n")
  const current = service()
  expect(await current.inspect()).toMatchObject({
    available: true,
    changes: [{ path: "local.txt" }],
  })
  const localIgnore = join(dir, ".git", "local-ignore")
  await writeFile(localIgnore, "local.txt\n")
  git("config", "core.excludesFile", localIgnore)
  expect(await current.inspect()).toMatchObject({
    available: true,
    changes: [{ path: "default.txt" }],
  })
  await writeFile(localIgnore, "local.txt\ndefault.txt\n")
  expect(await current.inspect()).toMatchObject({ available: true, dirty: false, changes: [] })
})

test("이미지 비교가 HEAD·인덱스·작업 파일을 각각 구분한다", async () => {
  const { readImage } = await import("../src/adapters/git/image.js")
  await writeFile(join(dir, "icon.svg"), "<svg>head</svg>")
  git("add", ".")
  git("commit", "-qm", "image base")
  await writeFile(join(dir, "icon.svg"), "<svg>index</svg>")
  git("add", ".")
  await writeFile(join(dir, "icon.svg"), "<svg>working</svg>")
  const staged = await readImage(dir, "icon.svg", undefined, { scope: "staged" })
  const unstaged = await readImage(dir, "icon.svg", undefined, { scope: "unstaged" })
  const image = (source: string) => ({
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`,
  })
  expect(staged).toMatchObject({
    before: image("<svg>head</svg>"),
    after: image("<svg>index</svg>"),
  })
  expect(unstaged).toMatchObject({
    before: image("<svg>index</svg>"),
    after: image("<svg>working</svg>"),
  })
})

test("커밋 이미지가 이름 변경 전 경로와 삭제·추가·오류 상태를 보존한다", async () => {
  const { readCommittedImage } = await import("../src/adapters/git/image.js")
  await writeFile(join(dir, "old.svg"), "<svg>before</svg>")
  git("add", ".")
  git("commit", "-qm", "before")
  const before = git("rev-parse", "HEAD")
  git("mv", "old.svg", "new.svg")
  await writeFile(join(dir, "new.svg"), "<svg>after</svg>")
  await symlink("new.svg", join(dir, "link.svg"))
  git("add", ".")
  git("commit", "-qm", "after")
  const after = git("rev-parse", "HEAD")
  const root = join(dir, ".git")
  const comparison = await readCommittedImage(root, {
    path: "new.svg",
    oldPath: "old.svg",
    before,
    after,
  })
  expect(comparison).toEqual({
    before: {
      dataUrl: `data:image/svg+xml;base64,${Buffer.from("<svg>before</svg>").toString("base64")}`,
    },
    after: {
      dataUrl: `data:image/svg+xml;base64,${Buffer.from("<svg>after</svg>").toString("base64")}`,
    },
  })
  expect(await readCommittedImage(root, { path: "old.svg", before, after })).toMatchObject({
    after: null,
  })
  expect(await readCommittedImage(root, { path: "new.svg", after })).toMatchObject({ before: null })
  expect(await readCommittedImage(root, { path: "link.svg", after })).toMatchObject({
    after: { error: expect.stringContaining("regular") },
  })
  await expect(readCommittedImage(root, { path: "../new.svg", after })).rejects.toThrow("relative")
  await expect(readCommittedImage(root, { path: "new.svg", after: "HEAD" })).rejects.toThrow(
    "object ID",
  )
})
