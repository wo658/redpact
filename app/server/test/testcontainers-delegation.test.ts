import { expect, test, vi } from "vitest"
import type { Environment } from "../src/core/types/environment.js"

const probe = vi.hoisted(() => {
  const item = {
    Id: "container",
    Image: "image",
    Config: {
      Labels: {
        "io.redpact.owner": "owner",
        "io.redpact.environment": "env",
        "com.docker.compose.service": "app",
      },
    },
    State: { Status: "running", Running: true, Health: { Status: "healthy" } },
    NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "49152" }] } },
    Mounts: [],
  }
  return { item, inspect: vi.fn(async () => item), getById: vi.fn((id: string) => ({ id })) }
})
vi.mock("testcontainers", async (original) => ({
  ...(await original<typeof import("testcontainers")>()),
  getContainerRuntimeClient: vi.fn(async () => ({
    info: { containerRuntime: { host: "localhost" } },
    container: {
      getById: probe.getById,
      inspect: probe.inspect,
      dockerode: {
        modem: { socketPath: "/test/docker.sock" },
        info: async () => ({ ID: "runtime" }),
        listContainers: async () => [{ Id: "container" }],
        listNetworks: async () => [],
        listVolumes: async () => ({ Volumes: [] }),
      },
    },
  })),
}))
vi.mock("execa", () => ({
  execa: vi.fn(async (_command, args: string[]) => ({
    exitCode: 0,
    stdout:
      (
        { info: "runtime", ps: "container", inspect: JSON.stringify([probe.item]) } as Record<
          string,
          string
        >
      )[args[0]] ?? "",
  })),
}))

import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"

test("컨테이너 관찰은 Testcontainers에서 조회한 정보로 접속 주소를 만든다", async () => {
  const record = {
    id: "env",
    ownerId: "owner",
    runtimeId: "runtime",
    projectName: "project",
    services: [{ name: "app", job: false }],
  } as Environment
  const observed = await createComposeAdapter("/unused").inspect(record)
  expect(observed.healthy).toBe(true)
  expect(probe.inspect).toHaveBeenCalledWith({ id: "container" })
  expect(observed.endpoints["app:3000"]).toEqual({ host: "localhost", port: 49152 })
})
