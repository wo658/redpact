import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import type { Environment } from "../src/core/types/environment.js"

const state = vi.hoisted(() => ({
  networks: new Map<string, Record<string, string>>(),
  blocked: false,
  disconnectAfterRemoval: false,
  disconnected: false,
}))
vi.mock("../src/adapters/environment/runtime.js", () => ({
  runtimeIdentity: async () => {
    if (state.disconnected) {
      throw new Error("daemon disconnected")
    }
    return "daemon"
  },
  runtimeClient: async () => ({
    info: { containerRuntime: { host: "localhost" } },
    network: {
      list: async ({ filters }: { filters: { label: string[] } }) =>
        [...state.networks]
          .filter(([, labels]) =>
            filters.label.every((value) => {
              const [key, expected] = value.split("=")
              return labels[key] === expected
            }),
          )
          .map(([Id]) => ({ Id })),
      getById: (id: string) => ({ id }),
      inspect: async ({ id }: { id: string }) => ({ Labels: state.networks.get(id) }),
      remove: async ({ id }: { id: string }) => {
        if (state.disconnectAfterRemoval) {
          state.disconnected = true
        }
        if (state.blocked) {
          throw new Error("network has active endpoints")
        }
        state.networks.delete(id)
      },
    },
    volume: { list: async () => [] },
  }),
  containersWithLabels: async () => [],
}))

import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"

const roots: string[] = []
afterEach(async () => {
  state.networks.clear()
  state.blocked = false
  state.disconnectAfterRemoval = false
  state.disconnected = false
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "redpact-network-cleanup-"))
  roots.push(root)
  const record = {
    id: "environment",
    ownerId: "owner",
    projectName: "current-project",
    runtimeId: "daemon",
    services: [],
    plan: { bindings: {} },
    settings: { environment: { stopTimeoutMs: 5000 }, tests: { env: {} } },
  } as unknown as Environment
  await mkdir(join(root, "environments", record.id), { recursive: true })
  return { root, record, adapter: createComposeAdapter(root) }
}
test("이전 Compose 이름과 무관하게 소유 네트워크를 회수하고 외부 네트워크는 보존한다", async () => {
  const { record, adapter } = await fixture()
  state.networks.set("legacy", {
    "io.redpact.owner": "owner",
    "io.redpact.environment": "environment",
  })
  state.networks.set("foreign", {
    "io.redpact.owner": "other",
    "io.redpact.environment": "environment",
    "com.docker.compose.project": "current-project",
  })
  state.networks.set("concurrent", {
    "io.redpact.owner": "owner",
    "io.redpact.environment": "other",
    "com.docker.compose.project": "current-project",
  })
  await adapter.stop(record)
  expect([...state.networks.keys()]).toEqual(["foreign", "concurrent"])
})
test("삭제 실패는 자원 ID와 원인을 보존하며 재시도 후 네트워크를 제거한다", async () => {
  const { root, record, adapter } = await fixture()
  state.networks.set("blocked-network", {
    "io.redpact.owner": "owner",
    "io.redpact.environment": "environment",
    "com.docker.compose.project": "current-project",
  })
  state.blocked = true
  await expect(adapter.stop(record)).rejects.toThrow(
    "blocked-network: network has active endpoints",
  )
  expect(await readFile(join(root, "environments", record.id, "cleanup.log"), "utf8")).toContain(
    "blocked-network",
  )
  state.blocked = false
  await adapter.stop(record)
  await adapter.stop(record)
  expect(state.networks.size).toBe(0)
})

test("삭제 실패 뒤 daemon 연결이 끊겨도 최초 원인과 마지막 자원 목록을 보존한다", async () => {
  const { root, record, adapter } = await fixture()
  state.networks.set("blocked-network", {
    "io.redpact.owner": "owner",
    "io.redpact.environment": "environment",
  })
  state.blocked = true
  state.disconnectAfterRemoval = true
  const failure = await adapter.stop(record).catch((error: Error) => error.message)
  expect(failure).toContain("blocked-network: network has active endpoints")
  expect(failure).toContain("Final inspection unavailable: daemon disconnected")
  expect(failure).toContain("Last observed: network blocked-network")
  expect(failure).not.toContain("Remaining: none")
  expect(await readFile(join(root, "environments", record.id, "cleanup.log"), "utf8")).toContain(
    failure,
  )
})
