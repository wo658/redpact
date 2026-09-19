import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { openStore } from "../src/adapters/storage/files.js"
import { environmentSchema } from "../src/core/environment-schema.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { EnvironmentAdapter, EnvironmentObservation } from "../src/core/types/environment.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createRuns } from "../src/workflows/runs.js"
import { createStopEnvironment } from "../src/workflows/stop-environment.js"
import { createTestWorktrees as createWorktrees } from "./helpers/worktrees.js"

let root: string
let storage: ReturnType<typeof openStore>
let service: ReturnType<typeof createEnvironments>
let stop: ReturnType<typeof createStopEnvironment>
let worktreeId: string
let adapter: EnvironmentAdapter
let digest = "input"
let stops = 0
const observation: EnvironmentObservation = {
  runtimeId: "runtime",
  resources: [],
  endpoints: {},
  healthy: true,
}
const settings = settingsSchema.parse({ composeFiles: ["compose.yaml"] })
const source = JSON.stringify(settings)
const sourceHash = createHash("sha256").update(source).digest("hex")
const settingsDigest = createHash("sha256")
  .update(JSON.stringify([[".redpact/settings.json", sourceHash]]))
  .digest("hex")
const selection = { services: ["app"], select: {} }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "redpact-env-lifecycle-"))
  storage = openStore(join(root, "state"))
  digest = "input"
  stops = 0
  adapter = {
    fingerprint: async () => digest,
    prepare: async () => {},
    inspect: async () => observation,
    stop: async () => {
      stops++
    },
  }
  const worktrees = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: (projectRoot) => ({
      projectRoot,
      read: async () => ({
        valid: true,
        file: "settings.json",
        source,
        digest: settingsDigest,
        bundle: { files: [{ path: ".redpact/settings.json", source, sha256: sourceHash }] },
        plan: {
          activeServices: ["app"],
          excludedServices: [],
          bindings: { app: {} },
          prerequisites: { app: {} },
          reasons: { app: ["root"] },
          requiredSecrets: [],
        },
        settings,
        issues: [],
      }),
    }),
  })
  const project = await worktrees.connect(root)
  worktreeId = (await worktrees.ensure(project.id, root)).id
  service = createEnvironments({ store: storage.store, worktrees, adapter, ownerId: randomUUID() })
  stop = createStopEnvironment({
    environments: service,
    runs: createRuns({
      store: storage.store,
      runner: {
        version: "test",
        execute: async () => ({ outcome: "passed", cases: [], errors: [] }),
      },
    }),
  })
})
afterEach(async () => {
  await service.close()
  storage.close()
  await rm(root, { recursive: true, force: true })
})
async function prepare() {
  const env = await service.prepare(
    worktreeId,
    randomUUID(),
    settingsDigest,
    selection,
    randomUUID(),
  )
  await service.idle()
  await stop.idle()
  return service.get(env.id)
}

test("an in-flight observation cannot revert a finished run to in_use", async () => {
  const env = await prepare()
  await service.reserve(env.id, worktreeId, env.runIds[0], settingsDigest)
  let observed!: (value: EnvironmentObservation) => void
  adapter.inspect = () =>
    new Promise((resolve) => {
      observed = resolve
    })
  const refresh = service.refresh(env.id)
  service.finish(env.id)
  observed(observation)
  await refresh
  expect(service.get(env.id).state).toBe("completed")
})
test("an environment belongs to one execution and cannot be reused after completion", async () => {
  const env = await prepare()
  expect(
    (await service.prepare(worktreeId, env.requestId, settingsDigest, selection, env.runIds[0])).id,
  ).toBe(env.id)
  await expect(
    service.prepare(worktreeId, env.requestId, settingsDigest, selection, randomUUID()),
  ).rejects.toMatchObject({ code: "environment_conflict" })
  await expect(
    service.reserve(env.id, worktreeId, randomUUID(), settingsDigest),
  ).rejects.toMatchObject({ code: "environment_conflict" })
  await service.reserve(env.id, worktreeId, env.runIds[0], settingsDigest)
  service.finish(env.id)
  await expect(
    service.reserve(env.id, worktreeId, env.runIds[0], settingsDigest),
  ).rejects.toMatchObject({ code: "environment_conflict" })
  expect(service.get(env.id).runIds).toEqual(env.runIds)
  await stop(env.id)
  await stop.idle()
  expect(service.get(env.id).state).toBe("stopped")
  await stop(env.id)
  expect(stops).toBe(1)
})
test("rejects changed inputs and different worktrees before reservation", async () => {
  const env = await prepare()
  await expect(
    service.reserve(env.id, randomUUID(), randomUUID(), settingsDigest),
  ).rejects.toMatchObject({ code: "environment_conflict" })
  digest = "changed"
  await expect(
    service.reserve(env.id, worktreeId, env.runIds[0], settingsDigest),
  ).rejects.toMatchObject({ code: "environment_conflict" })
  expect(service.get(env.id).runId).toBeUndefined()
})
test("explicit stop waits for late preparation resources and retries cleanup failure", async () => {
  let release!: () => void
  adapter.prepare = async (_env, _signal, observe) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    observe({ resources: [{ kind: "container", id: "late" }] })
  }
  const env = await service.prepare(
    worktreeId,
    randomUUID(),
    settingsDigest,
    selection,
    randomUUID(),
  )
  await stop(env.id)
  expect(stops).toBe(0)
  release()
  await service.idle()
  await stop.idle()
  expect(service.get(env.id).state).toBe("stopped")
  adapter.prepare = async () => {}
  const second = await prepare()
  adapter.stop = async () => {
    throw new Error("Daemon unavailable")
  }
  await stop(second.id)
  await service.idle()
  await stop.idle()
  expect(service.get(second.id).state).toBe("stop_failed")
  adapter.stop = async () => {}
  await stop(second.id)
  await service.idle()
  await stop.idle()
  expect(service.get(second.id).state).toBe("stopped")
})
test("restart preserves retained resources and reports interrupted preparation", async () => {
  const env = await prepare()
  storage.store.saveEnvironment({ ...env, state: "preparing" })
  await service.recover()
  expect(service.get(env.id).state).toBe("failed")
  expect(stops).toBe(0)
})

test("environment records require current lifecycle and run history", async () => {
  const env = await prepare()
  const { lifecycle: _lifecycle, runIds: _runIds, ...obsolete } = env
  expect(environmentSchema.safeParse(obsolete).success).toBe(false)
})

test("shutdown cannot publish a preparation accepted before an awaited fingerprint", async () => {
  let release!: (digest: string) => void
  adapter.fingerprint = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const pending = service.prepare(worktreeId, randomUUID(), settingsDigest, selection, randomUUID())
  const rejected = expect(pending).rejects.toMatchObject({ code: "closing" })
  await expect.poll(() => typeof release).toBe("function")
  await service.close()
  release("input")
  await rejected
  expect(storage.store.listEnvironments()).toEqual([])
})
test("environment execution history cannot be removed or reassigned", async () => {
  const env = await prepare()
  const runId = env.runIds[0]
  await service.reserve(env.id, worktreeId, runId, settingsDigest)
  service.finish(env.id)
  expect(() => storage.store.saveEnvironment({ ...service.get(env.id), runIds: [] })).toThrow(
    "identity",
  )
  expect(() =>
    storage.store.saveEnvironment({ ...service.get(env.id), runIds: [randomUUID()] }),
  ).toThrow("identity")
})

test("environment preparation requires an execution owner", async () => {
  await expect(
    // @ts-expect-error Standalone preparation is no longer an accepted API.
    service.prepare(worktreeId, randomUUID(), settingsDigest, selection),
  ).rejects.toMatchObject({ code: "invalid_input" })
  expect(storage.store.listEnvironments()).toEqual([])
})

test("restart cleanup removes every unfinished environment without rerunning tests", async () => {
  const first = await prepare()
  const second = await prepare()
  await service.reserve(first.id, worktreeId, first.runIds[0], settingsDigest)
  await service.recover()
  await stop.cleanupTemporary()
  expect(service.get(first.id).state).toBe("stopped")
  expect(service.get(second.id).state).toBe("stopped")
  expect(stops).toBe(2)
})

test("manual environments reject test run ownership and retired retention fields", async () => {
  const env = await prepare()
  expect(environmentSchema.safeParse({ ...env, lifecycle: "manual" }).success).toBe(false)
})

test("수동 확인 환경은 테스트 실행 ID 없이 준비하고 중복 실행과 테스트 예약을 막는다", async () => {
  const environment = await service.prepare(
    worktreeId,
    randomUUID(),
    settingsDigest,
    selection,
    null,
  )
  await service.idle()
  expect(service.get(environment.id)).toMatchObject({
    lifecycle: "manual",
    state: "ready",
    runIds: [],
  })
  await expect(
    service.prepare(worktreeId, randomUUID(), settingsDigest, selection, null),
  ).rejects.toThrow(/already/)
  await expect(
    service.reserve(environment.id, worktreeId, randomUUID(), settingsDigest),
  ).rejects.toThrow()
  await stop.cleanupTemporary()
  expect(service.get(environment.id).state).toBe("stopped")
})
