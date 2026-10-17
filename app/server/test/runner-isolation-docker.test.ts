import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { expect, test } from "vitest"
import { startRunner } from "../src/adapters/environment/runner-session.js"
import {
  inspectContainer,
  removeContainer,
  runtimeSocket,
} from "../src/adapters/environment/runtime.js"
import { minimalEnvironment } from "../src/adapters/environment/testcontainers.js"

test.runIf(process.env.REDPACT_DOCKER_TESTS === "1")(
  "한 worker가 강제 종료되어도 다른 실행을 유지하며 종료된 실행 자원만 자동 정리한다",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "runner-isolation-"))
    const worker = join(directory, "worker.mjs")
    const owner = randomUUID()
    await writeFile(
      worker,
      `
      import {GenericContainer} from ${JSON.stringify(import.meta.resolve("testcontainers"))};
      const container = await new GenericContainer('alpine:3.21').withLabels({'io.redpact.isolation-test':${JSON.stringify(owner)}}).withCommand(['sleep','120']).start();
      process.on('message', async message => {
        if(message.action==='exec') process.send({requestId:message.requestId,value:{stdout:String(process.pid),stderr:'',exitCode:0}});
        if(message.action==='stop') {await container.stop();process.send({requestId:message.requestId});process.disconnect()}
      });
      process.send({ready:true,containerId:container.getId()});
    `,
    )
    const options = {
      timeout: 60000,
      environment: {
        ...minimalEnvironment(),
        DOCKER_HOST: await runtimeSocket(),
        TESTCONTAINERS_RYUK_RECONNECTION_TIMEOUT: "1s",
      },
      failure: (message: string) => message,
    }
    const sessions: Awaited<ReturnType<typeof startRunner>>[] = []
    try {
      sessions.push(
        await startRunner(pathToFileURL(worker), {}, new AbortController().signal, options),
      )
      sessions.push(
        await startRunner(pathToFileURL(worker), {}, new AbortController().signal, options),
      )
      const [first, second] = sessions
      const firstState = await inspectContainer(first.containerId)
      const secondState = await inspectContainer(second.containerId)
      expect(firstState.Config.Labels?.["org.testcontainers.session-id"]).not.toBe(
        secondState.Config.Labels?.["org.testcontainers.session-id"],
      )
      const pid = Number((await first.exec([])).stdout)
      process.kill(pid, "SIGKILL")
      await expect
        .poll(
          async () => {
            try {
              await inspectContainer(first.containerId)
              return false
            } catch (error) {
              if ((error as { statusCode?: number }).statusCode === 404) {
                return true
              }
              throw error
            }
          },
          { timeout: 45000, interval: 250 },
        )
        .toBe(true)
      expect((await inspectContainer(second.containerId)).State.Running).toBe(true)
    } finally {
      await Promise.all(sessions.map((session) => session.stop().catch(() => {})))
      for (const session of sessions) {
        await removeContainer(session.containerId).catch(() => {})
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
  120000,
)
