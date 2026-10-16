import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DockerComposeEnvironment, GenericContainer } from "testcontainers"
import { expect, test } from "vitest"
import {
  containerLogSnapshot,
  containersWithLabels,
  inspectImage,
  removeContainer,
  removeImage,
} from "../src/adapters/environment/runtime.js"
import { ServiceWait } from "../src/adapters/environment/service-wait.js"

const dockerTest = test.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")
dockerTest(
  "이전 태그가 있는 빌드 실패는 성공으로 반환되지 않는다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-build-failure-"))
    const tag = `redpact-build-regression:${randomUUID()}`
    try {
      await writeFile(
        join(root, "Dockerfile"),
        "FROM node:24-bookworm-slim\nLABEL regression=before\n",
      )
      await GenericContainer.fromDockerfile(root).build(tag, { deleteOnExit: false })
      const original = await inspectImage(tag)
      await writeFile(join(root, "Dockerfile"), "FROM node:24-bookworm-slim\nRUN exit 17\n")
      await expect(
        GenericContainer.fromDockerfile(root).build(tag, { deleteOnExit: false }),
      ).rejects.toThrow()
      expect((await inspectImage(tag))?.Id).toBe(original?.Id)
    } finally {
      if (await inspectImage(tag)) {
        await removeImage(tag)
      }
      await rm(root, { recursive: true, force: true })
    }
  },
  60000,
)

dockerTest.each([false, true])(
  "Compose healthcheck 실패=%s 상태와 마지막 로그를 보존한다",
  async (unhealthy) => {
    const root = await mkdtemp(join(tmpdir(), "redpact-wait-regression-"))
    const project = `redpact-wait-${randomUUID()}`
    try {
      await writeFile(
        join(root, "compose.yaml"),
        `services:\n  probe:\n    image: node:24-bookworm-slim\n    command: [sh, -c, 'echo retained-stdout; echo retained-stderr >&2; sleep 60']\n    ports: ['8080']\n${unhealthy ? "    healthcheck:\n      test: [CMD, 'false']\n      interval: 1s\n      timeout: 1s\n      retries: 1\n" : ""}`,
      )
      const environment = new DockerComposeEnvironment(root, "compose.yaml")
        .withProjectName(project)
        .withAutoCleanup(false)
        .withDefaultWaitStrategy(new ServiceWait())
        .withStartupTimeout(10000)
      if (unhealthy) {
        await expect(environment.up()).rejects.toThrow()
      } else {
        await environment.up()
      }
      const containers = await containersWithLabels([`com.docker.compose.project=${project}`])
      expect(containers).toHaveLength(1)
      const logs = await containerLogSnapshot(containers[0].Id, 100)
      expect(logs).toContain("retained-stdout")
      expect(logs).toContain("retained-stderr")
    } finally {
      for (const container of await containersWithLabels([
        `com.docker.compose.project=${project}`,
      ])) {
        await removeContainer(container.Id)
      }
      const { runtimeClient } = await import("../src/adapters/environment/runtime.js")
      const client = await runtimeClient()
      for (const network of await client.network.list({
        filters: { label: [`com.docker.compose.project=${project}`] },
      })) {
        await client.network.remove(client.network.getById(network.Id))
      }
      await rm(root, { recursive: true, force: true })
    }
  },
  30000,
)

dockerTest(
  "공유 러너 입력 변경과 동시 빌드는 정확한 이미지 ID로 실행한다",
  async () => {
    const { runnerImage } = await import("../src/adapters/environment/runner-image.js")
    const { inspectContainer } = await import("../src/adapters/environment/runtime.js")
    const roots = await Promise.all(
      ["first", "second"].map((name) => mkdtemp(join(tmpdir(), `redpact-image-${name}-`))),
    )
    const name = `redpact-cache-${randomUUID()}`
    const images = new Set<string>()
    async function start(root: string) {
      const image = await runnerImage(root, name, ["Dockerfile", "value"])
      const container = await image
        .withAutoCleanup(false)
        .withAutoRemove(false)
        .withCommand(["sleep", "60"])
        .start()
      try {
        const info = await inspectContainer(container.getId())
        images.add(info.Image)
        return { id: info.Image, value: (await container.exec(["cat", "/value"])).stdout }
      } finally {
        await removeContainer(container.getId())
      }
    }
    try {
      for (const root of roots) {
        await writeFile(join(root, "Dockerfile"), "FROM node:24-bookworm-slim\nCOPY value /value\n")
      }
      await writeFile(join(roots[0], "value"), "first")
      await writeFile(join(roots[1], "value"), "second")
      const [first, second] = await Promise.all(roots.map(start))
      expect(first.value).toBe("first")
      expect(second.value).toBe("second")
      expect(first.id).not.toBe(second.id)
      expect(await start(roots[0])).toEqual(first)
      await writeFile(join(roots[0], "value"), "changed")
      const changed = await start(roots[0])
      expect(changed.value).toBe("changed")
      expect(changed.id).not.toBe(first.id)
    } finally {
      for (const id of images) {
        for (const tag of (await inspectImage(id))?.RepoTags ?? []) {
          if (tag.startsWith(`${name}:`)) {
            await removeImage(tag)
          }
        }
      }
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    }
  },
  60000,
)
