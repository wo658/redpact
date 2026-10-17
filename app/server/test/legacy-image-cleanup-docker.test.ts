import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import {
  inspectContainer,
  inspectImage,
  runtimeIdentity,
} from "../src/adapters/environment/runtime.js"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import type { Environment } from "../src/core/types/environment.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

dockerTest(
  "실제 Docker 정리 재시도는 무라벨 이미지를 제거하고 외부 컨테이너를 보존한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-legacy-docker-"))
    const id = randomUUID()
    const ownerId = randomUUID()
    const projectName = `redpact-legacy-${id}`
    const image = `${projectName}-app`
    const network = `${projectName}-network`
    const owned = `${projectName}-owned`
    const foreign = `${projectName}-foreign`
    const source = join(root, "environments", id, "source")
    const labels = [
      "--label",
      `io.redpact.owner=${ownerId}`,
      "--label",
      `io.redpact.environment=${id}`,
    ]
    const docker = (args: string[]) => execa("docker", args, { timeout: 60000 })
    try {
      await mkdir(source, { recursive: true })
      await writeFile(
        join(source, "Dockerfile"),
        `FROM node:24-alpine\nLABEL fixture.legacy="${id}"\n`,
      )
      await writeFile(join(source, ".redpact-resolved.yaml"), "services:\n  app:\n    build: .\n")
      await docker(["build", "-t", image, source])
      const built = await inspectImage(image)
      expect(built?.Config.Labels?.["io.redpact.owner"]).toBeUndefined()
      await docker(["network", "create", ...labels, network])
      const ownedId = (
        await docker([
          "run",
          "-d",
          "--name",
          owned,
          "--network",
          network,
          ...labels,
          "--label",
          "com.docker.compose.service=app",
          image,
          "sleep",
          "300",
        ])
      ).stdout
      const foreignId = (
        await docker([
          "run",
          "-d",
          "--name",
          foreign,
          "--network",
          network,
          "node:24-alpine",
          "sleep",
          "300",
        ])
      ).stdout
      const record = {
        id,
        ownerId,
        projectName,
        runtimeId: await runtimeIdentity(),
        lifecycle: "manual",
        services: [{ name: "app", job: false }],
        resources: [],
        plan: { bindings: {} },
        settings: { environment: { stopTimeoutMs: 15000 }, tests: { env: {} } },
      } as unknown as Environment
      const adapter = createComposeAdapter(root)
      await expect(adapter.stop(record)).rejects.toThrow("Cleanup failed; retry Stop")
      await expect(inspectContainer(ownedId)).rejects.toMatchObject({ statusCode: 404 })
      expect((await inspectContainer(foreignId)).State.Running).toBe(true)
      expect((await inspectImage(image))?.Id).toBe(built?.Id)
      const proofPath = join(root, "environments", id, "runtime", "legacy-image-ownership.json")
      expect(JSON.parse(await readFile(proofPath, "utf8")).images[image]).toBe(built?.Id)
      const refreshed = { ...record, ...(await adapter.inspect(record)) }
      expect(refreshed.resources.map((resource) => resource.kind)).toEqual(["network"])
      await docker(["network", "disconnect", network, foreignId])
      await createComposeAdapter(root).stop(refreshed)
      expect(await inspectImage(image)).toBeNull()
      expect((await adapter.inspect(record)).resources).toEqual([])
      expect((await inspectContainer(foreignId)).State.Running).toBe(true)
      await expect(readFile(proofPath)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await docker(["rm", "-f", owned, foreign]).catch(() => undefined)
      await docker(["network", "rm", network]).catch(() => undefined)
      await docker(["image", "rm", image]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  },
  120000,
)
