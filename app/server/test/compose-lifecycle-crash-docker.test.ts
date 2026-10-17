import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { getContainerRuntimeClient } from "testcontainers"
import { expect, test } from "vitest"
import { startComposeSession } from "../src/adapters/environment/compose-session.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

dockerTest(
  "동시 임시 실행 중 한 worker를 강제 종료하면 해당 자원만 자동 정리한다",
  async () => {
    const client = await getContainerRuntimeClient()
    const fixtures: Array<{
      directory: string
      label: string
      session: ReturnType<typeof startComposeSession>
    }> = []
    async function inventory(label: string) {
      const filters = { label: [label] }
      return {
        containers: await client.container.list({ all: true, filters }),
        networks: await client.network.list({ filters }),
      }
    }
    async function cleanupFixture(fixture: (typeof fixtures)[number]) {
      if (fixture.session.alive()) {
        await fixture.session.terminate()
      }
      // Bound cleanup to this test's unique labels even when a crash assertion fails.
      const remaining = await inventory(fixture.label)
      for (const container of remaining.containers) {
        const handle = client.container.getById(container.Id)
        await client.container.stop(handle, { timeout: 0 })
        await client.container.remove(handle, { removeVolumes: true })
      }
      for (const network of remaining.networks) {
        try {
          await client.network.remove(client.network.getById(network.Id))
        } catch (error) {
          if ((error as { statusCode?: number }).statusCode !== 404) {
            throw error
          }
        }
      }
      await rm(fixture.directory, { recursive: true, force: true })
    }
    try {
      for (let index = 0; index < 2; index++) {
        const directory = await mkdtemp(join(tmpdir(), "compose-crash-"))
        const identity = randomUUID()
        const projectName = `redpact-crash-${identity}`
        const label = `io.redpact.crash-test=${identity}`
        await writeFile(
          join(directory, "compose.yaml"),
          `services:
  app:
    image: postgres:17-alpine
    entrypoint: [sleep, '3600']
    labels:
      io.redpact.crash-test: ${identity}
networks:
  default:
    labels:
      io.redpact.crash-test: ${identity}
`,
        )
        const session = startComposeSession({
          executable: process.execPath,
          args: [
            "--import",
            import.meta.resolve("tsx"),
            fileURLToPath(
              new URL("../src/adapters/environment/compose-worker.ts", import.meta.url),
            ),
          ],
          cwd: directory,
          env: { ...process.env, TESTCONTAINERS_RYUK_RECONNECTION_TIMEOUT: "1s" },
          spec: {
            temporary: true,
            runnerName: `${projectName}-runner`,
            networkLabels: { "io.redpact.crash-test": identity },
            directory,
            files: ["compose.yaml"],
            services: ["app"],
            profiles: [],
            projectName,
            timeoutMs: 20000,
          },
          signal: AbortSignal.timeout(25000),
          preparationLog: join(directory, "preparation.log"),
          servicesLog: join(directory, "services.log"),
          redact: (value) => value,
          redactions: [],
        })
        // Attach rejection handling immediately while the second worker starts.
        void session.ready.catch(() => {})
        fixtures.push({ directory, label, session })
      }
      await Promise.all(fixtures.map((fixture) => fixture.session.ready))
      const [first, second] = fixtures
      const sessions: string[] = []
      for (const fixture of fixtures) {
        const before = await inventory(fixture.label)
        expect(before.containers).toHaveLength(1)
        expect(before.networks).toHaveLength(2)
        const sessionId = before.networks.find((network) => network.Name.endsWith("-runner"))
          ?.Labels?.["org.testcontainers.session-id"]
        if (!sessionId) {
          throw new Error("Managed network session label missing")
        }
        expect(sessionId).toBeTruthy()
        sessions.push(sessionId)
        const reapers = await client.container.list({
          filters: {
            label: [
              `org.testcontainers.ryuk.session-id=${sessionId}`,
              "org.testcontainers.ryuk=isolated",
            ],
          },
        })
        expect(reapers).toHaveLength(1)
        expect(reapers[0].Labels["org.testcontainers.ryuk"]).not.toBe("true")
      }
      expect(new Set(sessions).size).toBe(2)
      await first.session.terminate()
      await expect
        .poll(
          async () => {
            const remaining = await inventory(first.label)
            return remaining.containers.length + remaining.networks.length
          },
          { timeout: 25000, interval: 300 },
        )
        .toBe(0)
      const surviving = await inventory(second.label)
      expect(surviving.containers).toHaveLength(1)
      expect(surviving.containers[0].State).toBe("running")
      expect(surviving.networks).toHaveLength(2)
      expect(second.session.alive()).toBe(true)
      await second.session.stop(15000)
      expect(await inventory(second.label)).toEqual({ containers: [], networks: [] })
    } finally {
      await Promise.all(fixtures.map(cleanupFixture))
    }
  },
  60000,
)
