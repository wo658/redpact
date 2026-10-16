import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import type { Environment } from "../src/core/types/environment.js"

const runtime = vi.hoisted(() => ({
  container: true,
  network: true,
  fail: true,
  image: "sha256:original",
  owner: "owner",
  environment: "environment",
  removed: [] as string[],
}))
vi.mock("../src/adapters/environment/runtime.js", () => ({
  runtimeIdentity: async () => "daemon",
  containersWithLabels: async (labels: string[]) =>
    runtime.container && !labels.includes("io.redpact.integration") ? [{ Id: "container" }] : [],
  inspectContainer: async () => ({
    Image: "sha256:original",
    Config: {
      Labels: {
        "io.redpact.owner": runtime.owner,
        "io.redpact.environment": runtime.environment,
        "com.docker.compose.service": "app",
      },
    },
    State: { Status: "running", Running: true },
    NetworkSettings: { Ports: {} },
  }),
  inspectImage: async () => (runtime.image ? { Id: runtime.image, Config: { Labels: {} } } : null),
  removeImage: async (tag: string) => {
    runtime.removed.push(tag)
    runtime.image = ""
  },
  containerLogSnapshot: async () => "retained log",
  runtimeClient: async () => ({
    container: {
      getById: (id: string) => id,
      stop: async () => {},
      remove: async () => {
        runtime.container = false
      },
    },
    network: {
      list: async () => (runtime.network ? [{ Id: "network" }] : []),
      getById: (id: string) => id,
      inspect: async () => ({
        Labels: {
          "io.redpact.owner": runtime.owner,
          "io.redpact.environment": runtime.environment,
        },
      }),
      remove: async () => {
        if (runtime.fail) {
          throw new Error("foreign endpoint")
        }
        runtime.network = false
      },
    },
    volume: { list: async () => [] },
  }),
}))

import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"

test("기존 무라벨 빌드 이미지의 정리 증거는 컨테이너 제거 후 네트워크 실패와 재시도를 견딘다", async () => {
  const root = await mkdtemp(join(tmpdir(), "legacy-image-cleanup-"))
  const id = randomUUID()
  Object.assign(runtime, {
    environment: id,
    container: true,
    network: true,
    fail: true,
    image: "sha256:original",
    removed: [],
  })
  const record = {
    id,
    ownerId: runtime.owner,
    runtimeId: "daemon",
    projectName: "redpact-owned",
    lifecycle: "manual",
    services: [{ name: "app", job: false }],
    resources: [],
    plan: { bindings: {} },
    settings: { environment: { stopTimeoutMs: 1000 }, tests: { env: {} } },
  } as unknown as Environment
  const directory = join(root, "environments", id)
  await mkdir(join(directory, "source"), { recursive: true })
  await writeFile(
    join(directory, "source", ".redpact-resolved.yaml"),
    "services:\n  app:\n    build:\n      context: .\n",
  )
  try {
    const adapter = createComposeAdapter(root)
    await expect(adapter.stop(record)).rejects.toThrow("foreign endpoint")
    expect(runtime.container).toBe(false)
    const proofPath = join(directory, "runtime", "legacy-image-ownership.json")
    expect(JSON.parse(await readFile(proofPath, "utf8"))).toEqual({
      version: 1,
      environmentId: id,
      ownerId: runtime.owner,
      runtimeId: "daemon",
      images: { "redpact-owned-app": "sha256:original" },
    })
    const afterFailure = { ...record, ...(await adapter.inspect(record)) }
    runtime.fail = false
    await expect(createComposeAdapter(root).stop(afterFailure)).resolves.toBeUndefined()
    expect(runtime.removed).toEqual(["redpact-owned-app"])
    await expect(readFile(proofPath)).rejects.toMatchObject({ code: "ENOENT" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.each(["absent", "corrupt", "foreign", "replaced"])(
  "%s 정리 증거는 외부 또는 바뀐 이미지 삭제를 허용하지 않는다",
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), "legacy-image-untrusted-"))
    const id = randomUUID()
    const hasContainer = mode === "corrupt" || mode === "foreign"
    Object.assign(runtime, {
      environment: id,
      container: hasContainer,
      network: true,
      fail: false,
      image: mode === "replaced" ? "sha256:replacement" : "sha256:original",
      removed: [],
    })
    const record = {
      id,
      ownerId: runtime.owner,
      runtimeId: "daemon",
      projectName: "redpact-owned",
      lifecycle: "manual",
      services: [{ name: "app", job: false }],
      resources: [],
      plan: { bindings: {} },
      settings: { environment: { stopTimeoutMs: 1000 }, tests: { env: {} } },
    } as unknown as Environment
    const directory = join(root, "environments", id)
    await mkdir(join(directory, "source"), { recursive: true })
    await mkdir(join(directory, "runtime"), { recursive: true })
    await writeFile(
      join(directory, "source", ".redpact-resolved.yaml"),
      "services:\n  app:\n    build:\n      context: .\n",
    )
    if (mode !== "absent") {
      await writeFile(
        join(directory, "runtime", "legacy-image-ownership.json"),
        mode === "corrupt"
          ? "{"
          : JSON.stringify({
              version: 1,
              environmentId: mode === "foreign" ? "another-environment" : id,
              ownerId: runtime.owner,
              runtimeId: "daemon",
              images: { "redpact-owned-app": "sha256:original" },
            }),
      )
    }
    try {
      await expect(createComposeAdapter(root).stop(record)).rejects.toThrow()
      expect(runtime.removed).toEqual([])
      expect(runtime.image).toBe(mode === "replaced" ? "sha256:replacement" : "sha256:original")
      if (hasContainer) {
        expect(runtime.container).toBe(true)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
