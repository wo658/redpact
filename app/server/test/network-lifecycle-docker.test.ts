import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { StartedTestContainer } from "testcontainers"
import { expect, test } from "vitest"
import { runtimeClient, runtimeIdentity } from "../src/adapters/environment/runtime.js"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import type { Environment } from "../src/core/types/environment.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

dockerTest(
  "같은 제한된 주소 대역을 반복 반환하고 동시 실행 및 외부 네트워크를 보존한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-network-lifecycle-"))
    const ownerId = randomUUID()
    const client = await runtimeClient()
    const runtimeId = await runtimeIdentity()
    const owned = new Set<string>()
    const adapter = createComposeAdapter(root)
    // A Docker-selected subnet is reused explicitly: allocation must be released on every stop.
    let subnet: string | undefined
    const foreign = await client.network.create({ Name: `redpact-test-foreign-${ownerId}` })
    owned.add(foreign.id)
    const concurrent = await client.network.create({
      Name: `redpact-test-concurrent-${ownerId}`,
      Labels: { "io.redpact.owner": ownerId, "io.redpact.environment": "another-run" },
    })
    owned.add(concurrent.id)
    try {
      for (let iteration = 0; iteration < 5; iteration++) {
        const id = randomUUID()
        const record = {
          id,
          ownerId,
          runtimeId,
          projectName: `redpact-${id}`,
          services: [],
          lifecycle: "run",
          plan: { bindings: {} },
          settings: { environment: { stopTimeoutMs: 5000 }, tests: { env: {} } },
        } as unknown as Environment
        await mkdir(join(root, "environments", id), { recursive: true })
        const network = await client.network.create({
          Name: `redpact-test-${id}`,
          Labels: { "io.redpact.owner": ownerId, "io.redpact.environment": id },
          ...(subnet ? { IPAM: { Config: [{ Subnet: subnet }] } } : {}),
        })
        owned.add(network.id)
        const details = await client.network.inspect(network)
        const allocated = details.IPAM?.Config?.[0]?.Subnet
        expect(allocated).toBeTruthy()
        subnet ??= allocated
        expect(allocated).toBe(subnet)
        expect((await adapter.inspect(record)).resources).toContainEqual({
          kind: "network",
          id: network.id,
        })
        await adapter.stop(record)
        await adapter.stop(record)
        await expect(client.network.inspect(network)).rejects.toMatchObject({ statusCode: 404 })
        owned.delete(network.id)
        expect((await client.network.inspect(foreign)).Id).toBe(foreign.id)
        expect((await client.network.inspect(concurrent)).Id).toBe(concurrent.id)
      }
    } finally {
      for (const id of owned) {
        await client.network.remove(client.network.getById(id))
      }
      await rm(root, { recursive: true, force: true })
    }
  },
  60000,
)

dockerTest(
  "외부 컨테이너가 연결된 소유 네트워크는 실패 원인을 남기고 연결 해제 후 재시도한다",
  async () => {
    const { GenericContainer } = await import("testcontainers")
    const root = await mkdtemp(join(tmpdir(), "redpact-network-busy-"))
    const id = randomUUID()
    const ownerId = randomUUID()
    const client = await runtimeClient()
    const network = await client.network.create({
      Name: `redpact-test-busy-${id}`,
      Labels: { "io.redpact.owner": ownerId, "io.redpact.environment": id },
    })
    const record = {
      id,
      ownerId,
      runtimeId: await runtimeIdentity(),
      projectName: `redpact-${id}`,
      services: [],
      lifecycle: "run",
      plan: { bindings: {} },
      settings: { environment: { stopTimeoutMs: 5000 }, tests: { env: {} } },
    } as unknown as Environment
    await mkdir(join(root, "environments", id), { recursive: true })
    const adapter = createComposeAdapter(root)
    let container: StartedTestContainer | undefined
    try {
      container = await new GenericContainer("alpine:3.21")
        .withCommand(["sleep", "3600"])
        .withNetworkMode(network.id)
        .start()
      await expect(adapter.stop(record)).rejects.toThrow("active endpoints")
      expect((await client.network.inspect(network)).Id).toBe(network.id)
      await container.stop()
      container = undefined
      await adapter.stop(record)
      await expect(client.network.inspect(network)).rejects.toMatchObject({ statusCode: 404 })
    } finally {
      await container?.stop()
      await client.network.remove(network).catch((error: { statusCode?: number }) => {
        if (error.statusCode !== 404) {
          throw error
        }
      })
      await rm(root, { recursive: true, force: true })
    }
  },
  60000,
)
