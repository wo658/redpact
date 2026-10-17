import { DockerComposeEnvironment, getContainerRuntimeClient, Network } from "testcontainers"
import { createComposeLifecycle } from "./compose-lifecycle.js"
import { ServiceWait } from "./service-wait.js"

const lifecycle = createComposeLifecycle()
let input = ""
for await (const chunk of process.stdin) {
  input += chunk
}
const spec = JSON.parse(input)
const temporary = spec.temporary === true
const send = (value: unknown) => {
  if (process.connected) {
    process.send?.(value)
  }
}
const serviceLog = (message: string, source?: string) =>
  send({ type: "service-log", message, source })
const serviceLogEnd = (source: string) => send({ type: "service-log-end", source })
async function snapshotLogs() {
  // Compose command errors can happen before a wait strategy receives a container.
  try {
    const client = await getContainerRuntimeClient()
    const containers = await client.container.list({
      all: true,
      filters: {
        label: [`com.docker.compose.project=${spec.projectName}`],
      },
    })
    for (const container of containers) {
      try {
        for (const source of ["stdout", "stderr"] as const) {
          const logs = await client.container.logs(client.container.getById(container.Id), {
            follow: false,
            stdout: source === "stdout",
            stderr: source === "stderr",
          })
          logs.setEncoding("utf8")
          for await (const chunk of logs) {
            serviceLog(chunk.toString(), `${container.Id}:snapshot:${source}`)
          }
          serviceLogEnd(`${container.Id}:snapshot:${source}`)
        }
      } catch (logError) {
        serviceLog(`Log collection failed for ${container.Id}: ${String(logError)}\n`)
      }
    }
  } catch (logError) {
    serviceLog(`Service inventory unavailable: ${String(logError)}\n`)
  }
}
process.once("disconnect", () => {
  // Ryuk cleans temporary resources after this worker's connection closes.
  try {
    process.kill(-process.pid, "SIGKILL")
  } catch {
    process.exit(1)
  }
})
if (!temporary) {
  process.channel?.unref()
}
if (temporary) {
  process.on("message", async (message) => {
    if ((message as { type?: string }).type !== "stop") {
      return
    }
    try {
      await lifecycle.stop()
      send({ type: "stopped" })
      process.disconnect()
    } catch (error) {
      send({ type: "stop-failed", message: String(error) })
    }
  })
}
try {
  if (temporary) {
    lifecycle.network(
      await new Network({ nextUuid: () => spec.runnerName }).withLabels(spec.networkLabels).start(),
    )
    // Failed up() may never return a handle; keep Testcontainers' Compose cleanup API available.
    lifecycle.environment({
      down: async (options) => {
        const client = await getContainerRuntimeClient()
        await client.compose.down(
          { filePath: spec.directory, files: spec.files, projectName: spec.projectName },
          options,
        )
      },
    })
  }
  const environment = await new DockerComposeEnvironment(spec.directory, spec.files)
    .withProjectName(spec.projectName)
    .withProfiles(...spec.profiles)
    .withAutoCleanup(temporary)
    .withClientOptions(temporary ? { beforeCleanup: snapshotLogs } : {})
    .withDefaultWaitStrategy(
      new ServiceWait(temporary ? serviceLog : undefined, temporary ? serviceLogEnd : undefined),
    )
    .withStartupTimeout(spec.timeoutMs)
    .withBuild()
    .up(spec.services)
  if (temporary) {
    lifecycle.environment(environment)
    send({ type: "ready" })
  } else {
    process.stdout.write(JSON.stringify({ endpoints: {} }))
  }
} catch (error) {
  await snapshotLogs()
  const message = error instanceof Error ? error.message : "Compose startup failed"
  process.stderr.write(`${message}\n`)
  if (temporary) {
    send({ type: "failed", message })
  } else {
    process.exitCode = 1
  }
}
