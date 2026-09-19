import { randomUUID } from "node:crypto"
import { expect, test } from "vitest"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { CaptureRun } from "../src/core/types/playwright.js"
import { createCaptureWorkflow } from "../src/workflows/capture-ui.js"
import { createCaptures } from "../src/workflows/playwright.js"
import { resourceLimit } from "./helpers/resource-limit.js"

const settings = settingsSchema.parse({
  playwright: {
    targets: { captures: { purpose: "capture", testMatch: ["**/*.spec.{ts,js,mts,mjs}"] } },
    service: "app",
    port: 3000,
  },
})
function fixture() {
  const records = new Map<string, CaptureRun>(),
    events: string[] = [],
    envs = new Map<string, any>()
  const captures = createCaptures({
    source: async () => "",
    list: () => [...records.values()].map((r) => structuredClone(r)),
    save: (r) => {
      records.set(r.id, structuredClone(r))
    },
    artifact: async () => {
      throw new Error("not used")
    },
  })
  const target = {
    worktree: { id: "w", projectId: "p", projectRoot: "/app", checkoutRoot: "/app" },
    settings: { read: async () => ({ valid: true, settings, digest: "settings" }) },
    git: {
      inspect: async () => ({ available: true, revision: "a".repeat(40) }),
      mergeBase: async () => "b".repeat(40),
    },
  }
  const deps = {
    captures,
    worktrees: {
      resolve: async () => target,
      exclusive: async (fn: any) => fn(),
      getSelection: async () => ({ services: ["app"], select: {} }),
      setSelection: async () => {},
      ensure: async () => ({ id: "baseline" }),
    },
    projects: { tracking: async () => ({ mainBranch: "main" }) },
    baseline: {
      create: async () => {
        events.push("baseline")
        return "/baseline"
      },
      remove: async () => {
        events.push("remove-baseline")
      },
    },
    runner: {
      fingerprint: async () => "input-w",
      captureSources: async () => "sources",
      removeInputs: async () => {
        events.push("remove-inputs")
      },
      execute: async (_r: any, side: string, _e: any, _s: any, observe: any) => {
        events.push(`execute-${side}`)
        observe({ imageId: "image" })
        return { outcome: "passed", cases: [], browserVersion: "1" }
      },
      stop: async (_r: any, side: string) => {
        events.push(`stop-${side}`)
      },
    },
    environments: {
      fingerprint: async (_id: string, _selection: unknown, _digest: string) => "input-w",
      prepare: async (
        w: string,
        _request: string,
        _digest: string,
        selection: any,
        runId: string,
      ) => {
        const e = {
          id: randomUUID(),
          target: { worktreeId: w },
          state: "ready",
          inputDigest: `input-${w}`,
          selection,
          runId,
        }
        envs.set(e.id, e)
        events.push(`prepare-${w}`)
        return e
      },
      get: (id: string) => envs.get(id),
      reserve: async (id: string) => envs.get(id),
      finish: () => {},
      healthy: async () => true,
    },
    stopEnvironment: async (id: string) => {
      events.push("stop-env")
      envs.get(id).state = "stopped"
    },
  }
  return { deps, captures, events }
}
async function finished(f: ReturnType<typeof fixture>, id: string) {
  await expect.poll(() => f.captures.get(id).state).toBe("finished")
  return f.captures.get(id)
}
test("현재 앱만 한 번 실행하고 증거 수집 후 임시 환경을 정리한다", async () => {
  const f = fixture()
  const workflow = createCaptureWorkflow(f.deps as never)
  const run = await workflow.start("w")
  const result = await finished(f, run.id)
  expect(result.outcome).toBe("passed")
  expect(result.baseRevision).toBeUndefined()
  expect(result.after.inputDigest).toBe("input-w")
  expect(f.events.filter((event) => event.startsWith("execute-"))).toEqual(["execute-after"])
  expect(f.events).not.toContain("baseline")
  expect(f.events.indexOf("execute-after")).toBeLessThan(f.events.indexOf("stop-after"))
  expect(f.events.indexOf("stop-after")).toBeLessThan(f.events.indexOf("stop-env"))
  expect(f.events.at(-1)).toBe("remove-inputs")
  await workflow.close()
})
test("Git 비교 기준이 없어도 현재 화면을 캡처한다", async () => {
  const f = fixture()
  f.deps.baseline.create = async () => {
    throw new Error("must not run baseline")
  }
  const workflow = createCaptureWorkflow(f.deps as never)
  const run = await workflow.start("w")
  const result = await finished(f, run.id)
  expect(result.after.outcome).toBe("passed")
  expect(result.before.cases).toEqual([])
  expect(result.before.error).toBeUndefined()
  await workflow.close()
})
test("러너 정리가 실패해도 관측한 결과를 유지하고 취소로 정리만 재시도한다", async () => {
  const f = fixture()
  let fail = true
  f.deps.runner.stop = async () => {
    if (fail) {
      throw new Error("cleanup failed")
    }
  }
  const workflow = createCaptureWorkflow(f.deps as never),
    run = await workflow.start("w"),
    result = await finished(f, run.id)
  expect(result.after.outcome).toBe("passed")
  expect(result.cleanupError).toContain("cleanup failed")
  fail = false
  await workflow.cancel(run.id)
  expect(f.captures.get(run.id).cleanupError).toBeUndefined()
  expect(f.events.filter((e) => e === "execute-after")).toHaveLength(1)
  await workflow.close()
})

test("접수 후 앱 소스가 바뀌면 새 코드를 접수 당시 결과로 기록하지 않는다", async () => {
  const f = fixture()
  f.deps.environments.fingerprint = async () => "accepted-before-edit"
  const workflow = createCaptureWorkflow(f.deps as never),
    run = await workflow.start("w"),
    result = await finished(f, run.id)
  expect(result.outcome).toBe("error")
  expect(result.error).toContain("sources changed")
  expect(f.events).not.toContain("execute-after")
  await workflow.close()
})
test("취소는 브라우저 실행이 끝난 뒤 임시 환경을 제거한다", async () => {
  const f = fixture()
  f.deps.runner.execute = async (_r: any, _side: any, _env: any, signal: AbortSignal) => {
    f.events.push("browser-started")
    await new Promise<void>((resolve) =>
      signal.addEventListener(
        "abort",
        () => {
          f.events.push("browser-ended")
          resolve()
        },
        { once: true },
      ),
    )
    signal.throwIfAborted()
    return { outcome: "passed", cases: [], browserVersion: "1" }
  }
  const workflow = createCaptureWorkflow(f.deps as never),
    run = await workflow.start("w")
  await expect.poll(() => f.events.includes("browser-started")).toBe(true)
  const result = await workflow.cancel(run.id)
  expect(result.outcome).toBe("cancelled")
  expect(f.events.indexOf("browser-ended")).toBeLessThan(f.events.indexOf("stop-env"))
  await workflow.close()
})

test("앱 상태 확인이 실패해도 이미 수집한 브라우저 증거를 보존한다", async () => {
  const f = fixture()
  f.deps.environments.healthy = async () => false
  const workflow = createCaptureWorkflow(f.deps as never)
  const run = await workflow.start("w"),
    result = await finished(f, run.id)
  expect(result.outcome).toBe("error")
  expect(result.error).toContain("unhealthy")
  expect(result.after.browserVersion).toBe("1")
  expect(result.after.outcome).toBe("passed")
  await workflow.close()
})

test("재시작은 미완료 실행을 중단으로 표시하고 실행 없이 리소스만 정리한다", async () => {
  const f = fixture()
  const workflow = createCaptureWorkflow(f.deps as never)
  const run = await workflow.start("w")
  await finished(f, run.id)
  await workflow.close()
  const saved = f.captures.get(run.id)
  f.captures.save({ ...saved, state: "running", outcome: undefined })
  f.events.length = 0
  const restarted = createCaptureWorkflow(f.deps as never)
  await restarted.recover()
  expect(f.captures.get(run.id).outcome).toBe("interrupted")
  expect(f.events).toContain("stop-after")
  expect(f.events).not.toContain("execute-after")
  await restarted.close()
})

test("기능 검증 실행은 목적을 기록하고 기준 화면 환경을 만들지 않는다", async () => {
  const f = fixture()
  const configured = structuredClone(settings)
  Object.assign(configured.playwright!, {
    targets: {
      screens: { purpose: "capture", testMatch: ["captures/**/*.ts"] },
      checks: { purpose: "functional", testMatch: ["tests/**/*.spec.ts"] },
    },
  })
  const resolve = f.deps.worktrees.resolve
  f.deps.worktrees.resolve = async () => {
    const target = await resolve()
    return {
      ...target,
      settings: { read: async () => ({ valid: true, settings: configured, digest: "settings" }) },
    }
  }
  const workflow = createCaptureWorkflow(f.deps as never)
  const run = await workflow.start("w", undefined, undefined, "checks")
  const result = await finished(f, run.id)
  expect(result).toMatchObject({ target: "checks", purpose: "functional", outcome: "passed" })
  expect(f.events).not.toContain("baseline")
  expect(f.events).not.toContain("execute-before")
})

test.each(["after"])(
  "%s 자원 한도 초과는 성공으로 기록되지 않고 원인을 보존한다",
  async (limitedSide) => {
    const f = fixture()
    const execute = f.deps.runner.execute
    f.deps.runner.execute = async (run, side, env, signal, observe) => {
      if (side === limitedSide) {
        observe({ resourceLimit })
        throw new Error("Memory limit exceeded (64 MiB; Docker OOM)")
      }
      return execute(run, side, env, signal, observe)
    }
    const workflow = createCaptureWorkflow(f.deps as never)
    const run = await workflow.start("w")
    const result = await finished(f, run.id)
    expect(result.outcome).toBe("error")
    expect(result.error).toContain("Memory limit exceeded")
    expect(result[limitedSide as "before" | "after"].resourceLimit).toEqual(resourceLimit)
    await workflow.close()
  },
)

test("워크트리 정리는 기록이 없거나 실행 중이면 파일 삭제를 시작하지 않는다", async () => {
  const f = fixture()
  let cleaned = false
  Object.assign(f.deps.runner, {
    cleanupWorktree: async () => {
      cleaned = true
    },
  })
  const workflow = createCaptureWorkflow(f.deps as never)
  await expect(workflow.cleanupWorktree("w")).rejects.toThrow("Record worktree")
  const run = await workflow.start("w")
  const result = await finished(f, run.id)
  f.captures.save({ ...result, scope: "worktree", state: "running" })
  await expect(workflow.cleanupWorktree("w")).rejects.toThrow("Finish Playwright")
  expect(cleaned).toBe(false)
  f.captures.save({ ...result, scope: "worktree" })
  await workflow.cleanupWorktree("w")
  expect(cleaned).toBe(true)
  expect(f.captures.get(run.id).id).toBe(run.id)
  await workflow.close()
})

test("Playwright 접수와 조회는 준비할 Compose 선택의 지문을 사용한다", async () => {
  const f = fixture()
  f.deps.runner.fingerprint = async () => "unrelated-whole-tree-digest"
  const calls: unknown[] = []
  f.deps.environments.fingerprint = async (...args) => {
    calls.push(args)
    return "input-w"
  }
  const workflow = createCaptureWorkflow(f.deps as never)
  const run = await workflow.start("w")
  const result = await finished(f, run.id)
  expect(result.outcome).toBe("passed")
  expect(result.appDigest).toBe(result.after.inputDigest)
  expect((await workflow.inspect("w")).inputDigest).toBe(result.appDigest)
  expect(calls).toEqual([
    ["w", { services: ["app"], select: {} }, "settings"],
    ["w", { services: ["app"], select: {} }, "settings"],
  ])
  await workflow.close()
})

test("저장된 선택이 없으면 최근 실행의 선택으로 입력을 확인하고 조회 오류에도 기록을 유지한다", async () => {
  const f = fixture()
  const workflow = createCaptureWorkflow(f.deps as never)
  const run = await workflow.start("w")
  await finished(f, run.id)
  Object.assign(f.deps.worktrees, { getSelection: async () => undefined })
  expect((await workflow.inspect("w")).inputDigest).toBe(run.appDigest)
  f.deps.environments.fingerprint = async () => {
    throw new Error("Docker input inspection unavailable")
  }
  const inspection = await workflow.inspect("w")
  expect(inspection.inputDigest).toBeUndefined()
  expect(inspection.error).toBe("Docker input inspection unavailable")
  expect(inspection.runs.map((record) => record.id)).toEqual([run.id])
  await workflow.close()
})
