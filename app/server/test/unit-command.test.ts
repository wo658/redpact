import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { afterEach, expect, test } from "vitest"
import { createUnitTestFiles } from "../src/adapters/sources/unit-tests.js"
import { createProcessCommand } from "../src/adapters/test-runner/command.js"

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "unit-command-"))
  roots.push(root)
  const git = (...args: string[]) => execa("git", ["-C", root, ...args])
  await git("init", "-b", "main")
  await git("config", "user.email", "test@example.com")
  await git("config", "user.name", "Test")
  await writeFile(join(root, "existing.test.ts"), "old")
  await git("add", ".")
  await git("commit", "-m", "base")
  return { root, git, base: (await git("rev-parse", "HEAD")).stdout }
}
test("변경 파일 목록은 추가와 수정을 포함하고 관련 없는 파일을 제외한다", async () => {
  const { root, git, base } = await fixture()
  await writeFile(join(root, "committed.test.ts"), "committed")
  await git("add", ".")
  await git("commit", "-m", "test")
  await writeFile(join(root, "existing.test.ts"), "changed")
  await mkdir(join(root, "nested"))
  await writeFile(join(root, "nested/test_new.py"), "assert True")
  await writeFile(join(root, "source.ts"), "source")
  const result = await createUnitTestFiles().catalog(root, base, ["**/*.test.ts", "**/test_*.py"])
  expect(result.files.map((f) => f.path)).toEqual([
    "committed.test.ts",
    "existing.test.ts",
    "nested/test_new.py",
  ])
  expect(result.files[2].source).toBe("assert True")
})
test("execution directory rejects traversal and symlink escape", async () => {
  const { root } = await fixture()
  await symlink(tmpdir(), join(root, "outside"))
  await expect(createUnitTestFiles().directory(root, "outside")).rejects.toThrow()
  await expect(createUnitTestFiles().directory(root, "../")).rejects.toThrow()
})
test("arbitrary shell command runs once in cwd and retains nonzero output without case verdicts", async () => {
  const { root } = await fixture()
  const result = await createProcessCommand().execute(
    root,
    "/bin/sh",
    ["-c", "printf 'hello'; pwd; printf 'failure' >&2; exit 7"],
    new AbortController().signal,
  )
  expect(result).toMatchObject({ outcome: "command_failed", exitCode: 7, stderr: "failure" })
  expect(result.stdout).toContain(root)
  expect(result.stdout.match(/hello/g)).toHaveLength(1)
})
test("running command can be cancelled", async () => {
  const { root } = await fixture()
  const abort = new AbortController()
  const pending = createProcessCommand().execute(root, "/bin/sh", ["-c", "sleep 30"], abort.signal)
  setTimeout(() => abort.abort(), 100)
  expect((await pending).outcome).toBe("cancelled")
})

test("하위 프로젝트 범위를 지키고 이름이 변경된 테스트도 표시한다", async () => {
  const { root, git, base } = await fixture()
  await mkdir(join(root, "package"))
  await writeFile(join(root, "package/added.test.ts"), "new nested test")
  await writeFile(join(root, "sibling.test.ts"), "sibling")
  await git("mv", "existing.test.ts", "renamed.test.ts")
  await git("add", ".")
  await git("commit", "-m", "nested additions")
  const adapter = createUnitTestFiles()
  expect(
    (await adapter.catalog(join(root, "package"), base, ["**/*.test.ts"])).files.map(
      (file) => file.path,
    ),
  ).toEqual(["added.test.ts"])
  expect(
    (await adapter.catalog(root, base, ["**/*.test.ts"])).files.map((file) => file.path),
  ).toContain("renamed.test.ts")
})

test("large command output remains bounded while the whole command completes", async () => {
  const { root } = await fixture()
  const result = await createProcessCommand().execute(
    root,
    process.execPath,
    ["-e", 'process.stdout.write("x".repeat(400000))'],
    new AbortController().signal,
  )
  expect(result).toMatchObject({ outcome: "command_succeeded", exitCode: 0, truncated: true })
  expect(Buffer.byteLength(result.stdout)).toBe(256 * 1024)
})

test("a baseline test removed from the index but still on disk is not a new test", async () => {
  const { root, git, base } = await fixture()
  await git("rm", "--cached", "existing.test.ts")
  const result = await createUnitTestFiles().catalog(root, base, ["**/*.test.ts"])
  expect(result.files).toEqual([])
})

test("컨테이너 입력은 현재 WT 소스를 포함하고 기존 Python 및 Node 환경을 제외한다", async () => {
  const { snapshotInputs } = await import("../src/adapters/environment/inputs.js")
  const { readFile } = await import("node:fs/promises")
  const { root } = await fixture()
  for (const directory of [".venv", "venv", "node_modules", "__pycache__"]) {
    await mkdir(join(root, directory))
    await symlink("/missing-host-runtime", join(root, directory, "python"))
  }
  await writeFile(join(root, "uncommitted.test.ts"), "current WT")
  const destination = await mkdtemp(join(tmpdir(), "unit-source-"))
  roots.push(destination)
  await expect(snapshotInputs(root, destination)).resolves.toMatch(/^[a-f0-9]{64}$/)
  expect(await readFile(join(destination, "uncommitted.test.ts"), "utf8")).toBe("current WT")
  await expect(readFile(join(destination, ".venv/python"))).rejects.toThrow()
})

test("project catalog includes unchanged sources and excludes ignored, deleted and sibling files", async () => {
  const { root, git, base } = await fixture()
  await mkdir(join(root, "package"))
  await writeFile(join(root, "package/kept.test.ts"), "unchanged source")
  await writeFile(join(root, "package/deleted.test.ts"), "removed")
  await writeFile(join(root, ".gitignore"), "ignored.test.ts\n")
  await git("add", ".")
  await git("commit", "-m", "sources")
  const head = (await git("rev-parse", "HEAD")).stdout
  await rm(join(root, "package/deleted.test.ts"))
  await writeFile(join(root, "package/new.test.ts"), "new source")
  await writeFile(join(root, "package/ignored.test.ts"), "ignored")
  const catalog = await createUnitTestFiles().catalog(
    join(root, "package"),
    head,
    ["**/*.test.ts"],
    undefined,
    "all",
  )
  expect(catalog.files.map((file) => file.path)).toEqual(["kept.test.ts", "new.test.ts"])
  expect(catalog.files[0].source).toBe("unchanged source")
  expect(catalog.baseRevision).toBeUndefined()
  expect(
    (await createUnitTestFiles().catalog(root, base, ["**/*.test.ts"])).files.map(
      (file) => file.path,
    ),
  ).not.toContain("existing.test.ts")
})

test.each([
  [
    "동기 무한 루프",
    "while (true) {}",
    { memoryMiB: 2048, timeoutSeconds: 1 },
    "Time limit exceeded",
  ],
  [
    "자식 프로세스 메모리",
    `require('node:child_process').spawn(process.execPath, ['-e', 'globalThis.bytes = Buffer.alloc(128 * 1024 * 1024, 1); setInterval(() => {}, 1000)'], { stdio: 'inherit' }); setInterval(() => {}, 1000)`,
    { memoryMiB: 64, timeoutSeconds: 10 },
    "Memory limit exceeded",
  ],
] as const)(
  "%s는 외부 자원 감시가 실행을 종료하고 사유를 남긴다",
  async (_name, source, limits, reason) => {
    const abort = new AbortController()
    const fallback = setTimeout(() => abort.abort(), 3000)
    try {
      const result = await createProcessCommand().execute(
        process.cwd(),
        process.execPath,
        ["-e", source],
        abort.signal,
        process.env,
        limits,
      )
      expect(result.outcome).toBe("execution_error")
      expect(result.error).toContain(reason)
      expect(result.resourceLimit).toMatchObject({
        kind: reason.startsWith("Time") ? "time" : "memory",
        limits,
        termination: { target: "process_group", signal: "SIGKILL", exitCode: null },
      })
      expect(result.resourceLimit?.elapsedMs).toBeGreaterThan(0)
      expect(Number.isNaN(Date.parse(result.resourceLimit?.detectedAt ?? ""))).toBe(false)
      if (reason.startsWith("Memory")) {
        expect(result.resourceLimit?.observedMiB).toBeGreaterThan(limits.memoryMiB)
      }
      expect(abort.signal.aborted).toBe(false)
    } finally {
      clearTimeout(fallback)
    }
  },
  6000,
)
