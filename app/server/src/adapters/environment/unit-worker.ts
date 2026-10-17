import { GenericContainer, Wait } from "testcontainers"

import { failRunner, serveRunner, watchRunnerParent } from "./runner-host.js"

watchRunnerParent()
let input = ""
for await (const chunk of process.stdin) {
  input += chunk
}
const spec = JSON.parse(input)
try {
  const image = await GenericContainer.fromDockerfile(spec.source, spec.dockerfile)
    .withBuildkit()
    .withLabels({ "io.redpact.owner": spec.ownerId, "io.redpact.unit-run": spec.id })
    .build(spec.image, { deleteOnExit: false })
  const container = await image
    .withLabels({ "io.redpact.owner": spec.ownerId, "io.redpact.unit-run": spec.id })
    .withResourcesQuota({ memory: spec.limits.memoryMiB / 1024 })
    .withAutoCleanup(true)
    .withLogConsumer((stream) => {
      stream.on("data", (chunk) => process.stderr.write(chunk))
      stream.on("error", (error) =>
        process.stderr.write(`Container log stream failed: ${error.message}\n`),
      )
    })
    .withAutoRemove(false)
    .withEntrypoint(["/bin/sh", "-c"])
    .withCommand(["trap 'exit 0' TERM; echo redpact-unit-ready; while :; do sleep 1; done"])
    .withWorkingDir("/workspace")
    .withWaitStrategy(Wait.forLogMessage("redpact-unit-ready"))
    .withStartupTimeout(60000)
    .start()
  await serveRunner(container)
} catch (error) {
  await failRunner(error)
}
