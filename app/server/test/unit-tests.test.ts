import { expect, test, vi } from "vitest"
import type { UnitRun } from "../src/core/types/unit-tests.js"
import { createUnitTests } from "../src/workflows/unit-tests.js"

function fixture() {
  const records = new Map<string, UnitRun>()
  const config = {
    dockerfile: "unit.Dockerfile",
    cwd: ".",
    command: "any-command --all",
    patterns: ["**/*.test.ts"],
  }
  const execute = vi.fn(async (_run: UnitRun, signal: AbortSignal) => {
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    )
    return {
      outcome: "cancelled" as const,
      exitCode: null,
      stdout: "output",
      stderr: "",
      error: null,
      truncated: false,
    }
  })
  const deps = {
    worktrees: {
      resolve: async () => ({
        worktree: { id: "wt", projectId: "project", projectRoot: "/project" },
        git: { mergeBase: async () => "base" },
      }),
    },
    projects: { tracking: async () => ({ mainBranch: "main", hideMerged: false }) },
    settings: {
      project: async () => ({
        file: "settings.json",
        source: "{}",
        revision: "1",
        value: { unitTests: config },
        issues: [],
      }),
    },
    files: {
      directory: async () => "/project",
      catalog: async () => ({ files: [], diagnostics: [] }),
    },
    command: { execute, stop: vi.fn(async (_run: UnitRun) => {}) },
    store: {
      list: () => [...records.values()],
      save: (run: UnitRun) => {
        records.set(run.id, structuredClone(run))
      },
    },
  }
  return { deps, records, execute, config }
}
test("unit execution does not require added files or integration services and captures its command", async () => {
  const { deps, execute, config } = fixture()
  const service = createUnitTests(deps)
  expect((await service.inspect("wt")).settings).toMatchObject({ command: config.command })
  const run = await service.start("wt")
  config.command = "changed"
  expect(run.settings.command).toBe("any-command --all")
  expect(execute).toHaveBeenCalledOnce()
  await expect(service.start("wt")).rejects.toMatchObject({ code: "worktree_busy" })
  const cancelled = await service.cancel(run.id)
  expect(cancelled).toMatchObject({ state: "finished", outcome: "cancelled", stdout: "output" })
})
test("restart preserves unfinished evidence as interrupted without executing again", async () => {
  const { deps, records, execute } = fixture()
  records.set("00000000-0000-4000-8000-000000000001", {
    version: 2,
    runtimeId: "docker",
    containerId: "container",
    imageId: "image",
    inputDigest: "digest",
    cleanup: { state: "pending", error: null },
    id: "00000000-0000-4000-8000-000000000001",
    worktreeId: "wt",
    projectId: "project",
    projectRoot: "/project",
    settings: { dockerfile: "unit.Dockerfile", cwd: ".", command: "test", patterns: ["**/*.py"] },
    state: "running",
    createdAt: "now",
    finishedAt: null,
    outcome: null,
    exitCode: null,
    stdout: "",
    stderr: "",
    truncated: false,
    error: null,
  })
  const service = createUnitTests(deps)
  expect(service.get([...records.keys()][0]).outcome).toBe("interrupted")
  expect(execute).not.toHaveBeenCalled()
  await service.close()
  expect(deps.command.stop).toHaveBeenCalledOnce()
})

import { createObserveProjects } from "../src/workflows/observe-projects.js"

test("unit-only projects do not report missing integration test directories", async () => {
  const readTests = vi.fn(async () => {
    throw new Error("Missing integration directory")
  })
  const observe = createObserveProjects({
    files: { readTests },
    worktrees: {
      connect: async () => ({ id: "p", location: { kind: "directory", root: "/project" } }),
      ensure: async () => ({ id: "w" }),
      resolve: async () => ({
        settings: {
          read: async () => ({
            valid: true,
            settings: {
              composeFiles: [],
              tests: { directory: "tests" },
              unitTests: { command: "pytest", cwd: ".", patterns: ["**/*.py"] },
            },
          }),
        },
      }),
    },
    submissions: {},
    checkouts: async () => [],
  } as never)
  expect((await observe(["/project"])).issues).toEqual([])
  expect(readTests).not.toHaveBeenCalled()
})

test("단위 명령 종료 후 컨테이너를 정리하고 정리 실패를 테스트 결과와 분리한다", async () => {
  const { deps } = fixture()
  deps.command.execute = vi.fn(async () => ({
    outcome: "command_succeeded",
    exitCode: 0,
    stdout: "done",
    stderr: "",
    error: null,
    truncated: false,
  })) as never
  deps.command.stop.mockRejectedValueOnce(new Error("Docker unavailable"))
  const service = createUnitTests(deps)
  const run = await service.start("wt")
  await vi.waitFor(() => expect(service.get(run.id).state).toBe("finished"))
  expect(deps.command.stop).toHaveBeenCalledOnce()
  expect(service.get(run.id)).toMatchObject({
    outcome: "command_succeeded",
    exitCode: 0,
    cleanup: { state: "failed", error: "Docker unavailable" },
  })
  await service.cancel(run.id)
  expect(service.get(run.id)).toMatchObject({
    outcome: "command_succeeded",
    cleanup: { state: "removed", error: null },
  })
})

test("취소는 실행 종료를 기다린 후 컨테이너를 제거한다", async () => {
  const { deps } = fixture()
  let finish: (() => void) | undefined
  deps.command.execute = vi.fn(async (_run: UnitRun, signal: AbortSignal) => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    expect(signal.aborted).toBe(true)
    return {
      outcome: "cancelled",
      exitCode: null,
      stdout: "",
      stderr: "",
      error: null,
      truncated: false,
    }
  }) as never
  const service = createUnitTests(deps)
  const run = await service.start("wt")
  const pending = service.cancel(run.id)
  expect(deps.command.stop).not.toHaveBeenCalled()
  finish?.()
  await pending
  expect(deps.command.stop).toHaveBeenCalledOnce()
})

test("명령 완료 후 정리 중 재시작해도 관찰된 종료 결과는 보존한다", async () => {
  const { deps, records, execute, config } = fixture()
  const id = "00000000-0000-4000-8000-000000000002"
  records.set(id, {
    version: 2,
    id,
    worktreeId: "wt",
    projectId: "project",
    projectRoot: "/project",
    settings: config,
    runtimeId: "docker",
    containerId: "container",
    imageId: "image",
    inputDigest: "digest",
    cleanup: { state: "pending", error: null },
    state: "running",
    createdAt: "now",
    finishedAt: null,
    outcome: "command_succeeded",
    exitCode: 0,
    stdout: "passed",
    stderr: "",
    truncated: false,
    error: null,
  })
  const service = createUnitTests(deps)
  expect(service.get(id)).toMatchObject({
    outcome: "command_succeeded",
    exitCode: 0,
    stdout: "passed",
    error: null,
  })
  await service.close()
  expect(deps.command.stop).toHaveBeenCalledOnce()
  expect(execute).not.toHaveBeenCalled()
  expect(service.get(id).cleanup.state).toBe("removed")
})

test("project inspection requests the full catalog without a Git comparison or execution", async () => {
  const { deps, execute } = fixture()
  const mergeBase = vi.spyOn((await deps.worktrees.resolve()).git, "mergeBase")
  const target = await deps.worktrees.resolve()
  target.git.mergeBase = mergeBase
  deps.worktrees.resolve = async () => target
  const catalog = vi.spyOn(deps.files, "catalog")
  const service = createUnitTests(deps)
  await service.inspect("wt", "all")
  expect(mergeBase).not.toHaveBeenCalled()
  expect(catalog).toHaveBeenCalledWith("/project", null, ["**/*.test.ts"], undefined, "all")
  expect(execute).not.toHaveBeenCalled()
  await service.close()
})
