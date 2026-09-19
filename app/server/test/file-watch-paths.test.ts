import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({ windows: false }))
vi.mock("node:path", async (load) => {
  const paths = await load<typeof import("node:path")>()
  return {
    ...paths,
    relative: (from: string, to: string) =>
      (state.windows ? paths.win32 : paths).relative(from, to),
    isAbsolute: (path: string) => (state.windows ? paths.win32 : paths).isAbsolute(path),
    get sep() {
      return state.windows ? "\\" : "/"
    },
  }
})

import { FileWatch } from "../src/adapters/changes/file-watch.js"
import { contains } from "../src/adapters/changes/parcel-project-watch.js"

afterEach(() => {
  state.windows = false
})

test("Windows roots accept normalized descendants without admitting siblings or other drives", () => {
  state.windows = true
  expect(contains("C:\\repo", "C:/repo/src/a.ts")).toBe(true)
  expect(contains("C:\\repo", "C:/repo-other/a.ts")).toBe(false)
  expect(contains("C:\\repo", "D:/repo/a.ts")).toBe(false)
  expect(contains("C:/", "C:\\repo")).toBe(true)
})

for (const removeParent of [true, false]) {
  test(`unwatch preserves ${removeParent ? "nested" : "ancestor"} recursive coverage`, async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "redpact-overlap-")))
    const root = join(directory, "repo"),
      nested = join(root, "nested")
    await mkdir(nested, { recursive: true })
    const watch = new FileWatch([root, nested], () => false, true)
    const changed = vi.fn()
    watch.on("all", changed)
    watch.on("error", (error) => {
      throw error
    })
    await new Promise<void>((resolve) => watch.once("ready", resolve))
    try {
      await watch.unwatch(removeParent ? root : nested)
      await new Promise((resolve) => setTimeout(resolve, 300))
      changed.mockClear()
      await writeFile(join(nested, "source.ts"), "changed")
      await vi.waitFor(
        () => expect(changed).toHaveBeenCalledWith(expect.any(String), join(nested, "source.ts")),
        { timeout: 2500 },
      )
      changed.mockClear()
      await writeFile(join(root, "unrelated.ts"), "outside nested scope")
      await new Promise((resolve) => setTimeout(resolve, 400))
      if (removeParent) {
        // 직전 소스 쓰기의 추가 native 이벤트는 허용하되 남은 감시 범위를 벗어나면 안 된다.
        expect(changed.mock.calls.every(([, path]) => contains(nested, path))).toBe(true)
      } else {
        expect(changed).toHaveBeenCalledWith(expect.any(String), join(root, "unrelated.ts"))
      }
    } finally {
      await watch.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test("missing nested roots restore through existing parents without admitting sibling changes", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "redpact-missing-anchor-")))
  const root = join(directory, "missing", "checkout")
  const watch = new FileWatch([root], () => false, true)
  const changed = vi.fn()
  watch.on("all", changed)
  watch.on("error", (error) => {
    throw error
  })
  await new Promise<void>((resolve) => watch.once("ready", resolve))
  try {
    await writeFile(join(directory, "sibling"), "unrelated")
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(changed).not.toHaveBeenCalled()
    await mkdir(root, { recursive: true })
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2500 })
    changed.mockClear()
    await writeFile(join(root, "file.ts"), "restored")
    await vi.waitFor(
      () => expect(changed).toHaveBeenCalledWith(expect.any(String), join(root, "file.ts")),
      { timeout: 2500 },
    )
    await watch.unwatch(root)
    changed.mockClear()
    await writeFile(join(root, "file.ts"), "unwatched")
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(changed).not.toHaveBeenCalled()
  } finally {
    await watch.close()
    await rm(directory, { recursive: true, force: true })
  }
})
