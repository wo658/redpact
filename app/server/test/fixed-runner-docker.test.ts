import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { GenericContainer, Network, Wait } from "testcontainers"
import { expect, test } from "vitest"
import { createVitestRunner } from "../src/adapters/test-runner/vitest.js"

test.runIf(process.env.REDPACT_DOCKER_TESTS === "1")(
  "Integration 컨테이너가 서비스 DNS로 접근하고 호스트 변수를 상속하지 않는다",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "fixed-runner-"))
    const shared = createServer((_q, response) => response.end("shared-local"))
    await new Promise<void>((resolve) => shared.listen(0, "127.0.0.1", resolve))
    const address = shared.address()
    if (!address || typeof address === "string") {
      throw new Error("No shared listener")
    }
    const remote = await new GenericContainer("node:24-bookworm-slim")
      .withExposedPorts(3000)
      .withCommand([
        "node",
        "-e",
        "require('http').createServer((q,s)=>{s.statusCode=q.headers.authorization==='Bearer runner-secret'?200:401;s.end('external')}).listen(3000,'0.0.0.0',()=>console.log('ready'))",
      ])
      .withWaitStrategy(Wait.forLogMessage("ready"))
      .start()
    const network = await new Network().start()
    const ownerId = randomUUID()
    const runId = randomUUID()
    const app = await new GenericContainer("node:24-bookworm-slim")
      .withNetwork(network)
      .withNetworkAliases("app.redpact.test", "mock.redpact.test")
      .withCommand([
        "node",
        "-e",
        "require('http').createServer((q,s)=>s.end('managed')).listen(3000,'0.0.0.0',()=>console.log('ready'))",
      ])
      .withWaitStrategy(Wait.forLogMessage("ready"))
      .start()
    try {
      const runner = createVitestRunner(directory)
      const result = await runner.execute(
        {
          id: randomUUID(),
          workItemId: randomUUID(),
          digest: "test",
          runnerVersion: runner.version,
          parsed: [],
          createdAt: new Date().toISOString(),
          files: [
            {
              path: "network.test.ts",
              source: `
        import {test,expect} from 'vitest'; import {existsSync} from 'node:fs';
        test('관리 서비스에 컨테이너에서 접근한다', async()=>{
          expect(existsSync('/.dockerenv')).toBe(true);
          expect(await (await fetch(process.env.APP_URL)).text()).toBe('managed');
          expect(process.env.REDPACT_TOKEN).toBeUndefined();
          expect(existsSync('/var/run/docker.sock')).toBe(false);
          expect(await (await fetch(process.env.MOCK_URL)).text()).toBe('managed');
          expect(await (await fetch(process.env.SHARED_URL)).text()).toBe('shared-local');
          const external = await fetch(process.env.REMOTE_URL, {headers:{authorization:'Bearer '+process.env.REMOTE_TOKEN}});
          expect(external.status).toBe(200);expect(await external.text()).toBe('external');
        });`,
            },
          ],
        },
        runId,
        new AbortController().signal,
        { tests: { timeoutMs: 10000 } },
        {
          APP_URL: "http://app.redpact.test:3000",
          MOCK_URL: "http://mock.redpact.test:3000",
          SHARED_URL: `http://host.docker.internal:${address.port}`,
          REMOTE_URL: `http://host.docker.internal:${remote.getMappedPort(3000)}`,
          REMOTE_TOKEN: "runner-secret",
        },
        ["runner-secret"],
        {
          version: 1,
          services: { app: { ports: { "3000": { host: "app.redpact.test", port: 3000 } } } },
          runtime: { ownerId, environmentId: randomUUID(), network: network.getName() },
        },
      )
      expect(result, JSON.stringify(result)).toMatchObject({
        outcome: "passed",
        cases: [{ state: "passed" }],
      })
      expect(
        (
          await execa("docker", [
            "ps",
            "-aq",
            "--filter",
            `label=io.redpact.owner=${ownerId}`,
            "--filter",
            `label=io.redpact.integration=${runId}`,
          ])
        ).stdout.trim(),
      ).toBe("")
      expect((await fetch(`http://127.0.0.1:${address.port}`)).ok).toBe(true)
      expect(
        (
          await fetch(`http://${remote.getHost()}:${remote.getMappedPort(3000)}`, {
            headers: { authorization: "Bearer runner-secret" },
          })
        ).ok,
      ).toBe(true)
    } finally {
      await new Promise<void>((resolve, reject) =>
        shared.close((error) => (error ? reject(error) : resolve())),
      )
      await remote.stop()
      await app.stop()
      await network.stop()
      await rm(directory, { recursive: true, force: true })
    }
  },
  180000,
)
