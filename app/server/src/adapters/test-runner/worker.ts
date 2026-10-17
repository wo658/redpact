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
  const image = await runnerImage(spec.assets, "redpact-vitest", [
    "Dockerfile",
    "reporter.mjs",
    "package.json",
    "pnpm-lock.yaml",
  ])
  const container = await image
    .withLabels({
      "io.redpact.owner": spec.ownerId,
      "io.redpact.environment": spec.environmentId,
      "io.redpact.integration": spec.id,
    })
    .withEnvironment(spec.environment)
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
    .withExtraHosts([{ host: "host.docker.internal", ipAddress: "host-gateway" }])
    .withCopyDirectoriesToContainer([
      { source: spec.source, target: "/review/source", mode: 0o755 },
    ])
    .withCopyContentToContainer([
      { content: spec.config, target: "/review/vitest.config.mjs" },
      { content: JSON.stringify(spec.connections), target: "/review/connections.json" },
    ])
    .withEntrypoint(["/bin/sh", "-c"])
    .withCommand(["trap 'exit 0' TERM; echo redpact-integration-ready; while :; do sleep 1; done"])
    .withWaitStrategy(Wait.forLogMessage("redpact-integration-ready"))
    .withStartupTimeout(60000)
    .start()
  await serveRunner(container)
} catch (error) {
  await failRunner(error)
}
