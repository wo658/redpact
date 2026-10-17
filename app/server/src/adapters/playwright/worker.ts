import { Wait } from "testcontainers"
import { failRunner, serveRunner, watchRunnerParent } from "../environment/runner-host.js"
import { runnerImage } from "../environment/runner-image.js"

watchRunnerParent()
let input = ""
for await (const chunk of process.stdin) {
  input += chunk
}
const spec = JSON.parse(input)
try {
  const image = await runnerImage(spec.assets, "redpact-playwright", [
    "Dockerfile",
    "reporter.mjs",
    "viewport.cjs",
    "capture-viewport.cjs",
  ])
  const container = await image
    .withLabels({
      "io.redpact.owner": spec.ownerId,
      "io.redpact.capture": spec.id,
      "io.redpact.capture-side": spec.side,
    })
    .withEnvironment({ REDPACT_REDACT_VALUES: JSON.stringify(spec.redactions ?? []) })
    .withEnvironment({ REDPACT_UI_LANGUAGE: spec.uiLanguage })
    .withResourcesQuota({ memory: spec.limits.memoryMiB / 1024 })
    .withAutoCleanup(true)
    .withLogConsumer((stream) => {
      stream.on("data", (chunk) => process.stderr.write(chunk))
      stream.on("error", (error) =>
        process.stderr.write(`Container log stream failed: ${error.message}\n`),
      )
    })
    .withAutoRemove(false)
    .withNetworkMode(spec.network)
    .withEnvironment(spec.environment ?? {})
    .withExtraHosts([{ host: "host.docker.internal", ipAddress: "host-gateway" }])
    .withSharedMemorySize(Math.min(1024, Math.floor(spec.limits.memoryMiB / 2)) * 1024 * 1024)
    // Private host snapshots must remain readable by the container's unprivileged user.
    .withCopyDirectoriesToContainer([{ source: spec.tests, target: "/review/tests", mode: 0o755 }])
    .withCopyContentToContainer([
      { content: spec.config, target: "/review/playwright.config.cjs" },
      { content: JSON.stringify(spec.connections), target: "/review/connections.json" },
    ])
    .withEntrypoint(["/bin/sh", "-c"])
    .withCommand(["trap 'exit 0' TERM; echo redpact-capture-ready; while :; do sleep 1; done"])
    .withWaitStrategy(Wait.forLogMessage("redpact-capture-ready"))
    .withStartupTimeout(60000)
    .start()
  await serveRunner(container)
} catch (error) {
  await failRunner(error)
}
