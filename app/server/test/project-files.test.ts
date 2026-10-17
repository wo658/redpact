import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
})
test("프로젝트 파일 API로 폴더와 현재 원문을 읽는다", async () => {
  const app = createApp({
    projectFiles: { read: async () => ({ kind: "text", path: "hello.ts", content: "current" }) },
  } as never)
  const response = await app.request("/api/projects/project/files?path=hello.ts")
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ content: "current" })
})
test("폴더를 정렬하고 외부 경로·링크를 막으며 바이너리와 큰 파일을 구분한다", async () => {
  const { readProjectEntry } = await import("../src/adapters/project-files.js")
  const root = await mkdtemp(join(tmpdir(), "redpact-files-"))
  roots.push(root)
  await mkdir(join(root, "src"))
  await mkdir(join(root, ".git"))
  await writeFile(join(root, "hello.ts"), "<script>한글</script>\n")
  await writeFile(join(root, "binary"), Buffer.from([0, 1, 2]))
  await writeFile(join(root, "large"), Buffer.alloc(1024 * 1024 + 1, 65))
  await symlink(tmpdir(), join(root, "outside"))
  expect(await readProjectEntry(root, "")).toMatchObject({
    kind: "directory",
    entries: [
      { name: "src", kind: "directory" },
      { name: "binary" },
      { name: "hello.ts" },
      { name: "large" },
    ],
  })
  expect(await readProjectEntry(root, "hello.ts")).toMatchObject({
    kind: "text",
    content: "<script>한글</script>\n",
  })
  expect(await readProjectEntry(root, "binary")).toMatchObject({ kind: "binary" })
  expect(await readProjectEntry(root, "large")).toMatchObject({ kind: "too_large" })
  for (const path of [
    "../escape",
    "/etc/passwd",
    "outside/file",
    ".git/config",
    ".GIT/config",
    "src/../hello.ts",
  ]) {
    await expect(readProjectEntry(root, path)).rejects.toMatchObject({ code: "invalid_input" })
  }
})

test("기본 프로젝트 폴더에서 읽고 프로젝트 조회 실패는 전파한다", async () => {
  const { createProjectFiles } = await import("../src/workflows/project-files.js")
  const reads: string[][] = []
  const service = createProjectFiles({
    projects: {
      root: async (id) => {
        if (id === "missing") {
          throw Object.assign(new Error("missing"), { code: "not_found" })
        }
        return "/primary/project"
      },
    },
    read: async (root, path) => {
      reads.push([root, path])
      return { kind: "text", path, content: "" }
    },
  })
  await service.read("project", "file.ts")
  expect(reads).toEqual([["/primary/project", "file.ts"]])
  await expect(service.read("missing", "file.ts")).rejects.toMatchObject({ code: "not_found" })
  expect(reads).toHaveLength(1)
})

test("이미지 파일은 5 MiB까지 원본 바이트와 SVG 소스를 제공한다", async () => {
  const { readProjectEntry } = await import("../src/adapters/project-files.js")
  const root = await mkdtemp(join(tmpdir(), "redpact-images-"))
  roots.push(root)
  for (const [path, bytes, mediaType] of [
    ["ICON.PNG", Buffer.from([0, 1, 255]), "image/png"],
    ["favicon.ico", Buffer.from([0, 0, 1, 0]), "image/x-icon"],
    ["icon.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml"],
  ] as const) {
    await writeFile(join(root, path), bytes)
    expect(await readProjectEntry(root, path)).toMatchObject({
      kind: "image",
      path,
      dataUrl: `data:${mediaType};base64,${bytes.toString("base64")}`,
      ...(path.endsWith("svg") ? { content: bytes.toString() } : {}),
    })
  }
  await writeFile(join(root, "large.png"), Buffer.alloc(2 * 1024 * 1024))
  expect(await readProjectEntry(root, "large.png")).toMatchObject({ kind: "image" })
  await writeFile(join(root, "large.png"), Buffer.alloc(5 * 1024 * 1024 + 1))
  expect(await readProjectEntry(root, "large.png")).toMatchObject({ kind: "too_large" })
})

test("추적 필터를 API에서 기본 폴더 읽기까지 전달하고 잘못된 값을 거부한다", async () => {
  const { createProjectFiles } = await import("../src/workflows/project-files.js")
  const read = vi.fn(async () => ({ kind: "directory" as const, path: "src", entries: [] }))
  const app = createApp({
    projectFiles: createProjectFiles({
      projects: { root: async () => "/primary/project" },
      read,
    }),
  } as never)
  expect((await app.request("/api/projects/project/files?path=src&trackedOnly=true")).status).toBe(
    200,
  )
  expect(read).toHaveBeenLastCalledWith("/primary/project", "src", true)
  expect((await app.request("/api/projects/project/files?trackedOnly=false")).status).toBe(200)
  expect(read).toHaveBeenLastCalledWith("/primary/project", "", false)
  expect((await app.request("/api/projects/project/files?trackedOnly=maybe")).status).toBe(400)
})

test("Git 인덱스에 있는 파일과 상위 폴더만 표시하고 현재 수정 내용을 읽는다", async () => {
  const { readProjectEntry } = await import("../src/adapters/project-files.js")
  const root = await mkdtemp(join(tmpdir(), "redpact-tracked-files-"))
  roots.push(root)
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args])
  git("init", "--quiet")
  await mkdir(join(root, "src", "nested"), { recursive: true })
  await mkdir(join(root, "untracked-dir"))
  await writeFile(join(root, "src", "nested", "tracked 한글\nfile.ts"), "staged")
  await writeFile(join(root, "ignored.txt"), "tracked despite ignore")
  await writeFile(join(root, ".gitignore"), "ignored*\n")
  git("add", "src", ".gitignore")
  git("add", "-f", "ignored.txt")
  await writeFile(join(root, "ignored-other.txt"), "ignored")
  await writeFile(join(root, "src", "untracked.ts"), "untracked")
  await writeFile(join(root, "src", "nested", "tracked 한글\nfile.ts"), "modified")
  expect(await readProjectEntry(root, "", true)).toEqual({
    kind: "directory",
    path: "",
    entries: [
      { name: "src", kind: "directory" },
      { name: ".gitignore", kind: "file" },
      { name: "ignored.txt", kind: "file" },
    ],
  })
  expect(await readProjectEntry(root, "src", true)).toMatchObject({
    entries: [{ name: "nested", kind: "directory" }],
  })
  expect(await readProjectEntry(root, "src/nested/tracked 한글\nfile.ts", true)).toMatchObject({
    content: "modified",
  })
  await expect(readProjectEntry(root, "src/untracked.ts", true)).rejects.toMatchObject({
    code: "not_found",
  })
  expect(await readProjectEntry(root, "src/untracked.ts", false)).toMatchObject({
    content: "untracked",
  })
  expect(await readProjectEntry(join(root, "src"), "", true)).toMatchObject({
    entries: [{ name: "nested", kind: "directory" }],
  })
  await symlink(join(root, "ignored.txt"), join(root, "tracked-link"))
  git("add", "tracked-link")
  await expect(readProjectEntry(root, "tracked-link", true)).rejects.toMatchObject({
    code: "invalid_input",
  })
  await expect(readProjectEntry(root, "../escape", true)).rejects.toMatchObject({
    code: "invalid_input",
  })
  await rm(join(root, "src", "nested", "tracked 한글\nfile.ts"))
  expect(await readProjectEntry(root, "src/nested", true)).toMatchObject({ entries: [] })
})

test("일반 폴더와 손상된 Git 인덱스는 추적 필터에서 빈 목록으로 숨기지 않는다", async () => {
  const { readProjectEntry } = await import("../src/adapters/project-files.js")
  const root = await mkdtemp(join(tmpdir(), "redpact-files-errors-"))
  roots.push(root)
  await expect(readProjectEntry(root, "", true)).rejects.toThrow()
  expect(await readProjectEntry(root, "")).toMatchObject({ entries: [] })
  execFileSync("git", ["-C", root, "init", "--quiet"])
  expect(await readProjectEntry(root, "", true)).toMatchObject({ entries: [] })
  await writeFile(join(root, ".git", "index"), "broken index")
  await expect(readProjectEntry(root, "", true)).rejects.toThrow()
})

test("연결된 worktree의 인덱스를 사용하고 인덱스에서 제거된 파일을 제외한다", async () => {
  const { readProjectEntry } = await import("../src/adapters/project-files.js")
  const root = await mkdtemp(join(tmpdir(), "redpact-files-worktree-"))
  roots.push(root)
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args])
  git("init", "--quiet")
  await writeFile(join(root, "base.ts"), "base")
  git("add", "base.ts")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture")
  const linked = join(root, "linked")
  git("worktree", "add", "--quiet", "-b", "linked", linked)
  await writeFile(join(linked, "added.ts"), "staged addition")
  execFileSync("git", ["-C", linked, "add", "added.ts"])
  execFileSync("git", ["-C", linked, "rm", "--cached", "base.ts"])
  expect(await readProjectEntry(linked, "", true)).toMatchObject({
    entries: [{ name: "added.ts", kind: "file" }],
  })
  await expect(readProjectEntry(linked, "base.ts", true)).rejects.toMatchObject({
    code: "not_found",
  })
  expect(await readProjectEntry(root, "", true)).toMatchObject({
    entries: [{ name: "base.ts", kind: "file" }],
  })
})
