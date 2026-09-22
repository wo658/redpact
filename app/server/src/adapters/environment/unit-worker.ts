import { execa } from "execa"
import { GenericContainer, Wait } from "testcontainers"

process.once("disconnect", () => {
  try {
    process.kill(-process.pid, "SIGKILL")
  } catch {
    process.exit(1)
  }
})
process.channel?.unref()
let input = ""
for await (const chunk of process.stdin) {
  input += chunk
}
const spec = JSON.parse(input)
try {
  await execa(
    "docker",
    [
      "build",
      "--tag",
      spec.image,
      "--label",
      `io.redpact.owner=${spec.ownerId}`,
      "--label",
      `io.redpact.unit-run=${spec.id}`,
      "--file",
      spec.dockerfile,
      ".",
    ],
    { cwd: spec.source, maxBuffer: 1024 * 1024 },
  )
  const image = new GenericContainer(spec.image)
  const container = await image
    .withLabels({ "io.redpact.owner": spec.ownerId, "io.redpact.unit-run": spec.id })
    .withResourcesQuota({ memory: spec.limits.memoryMiB / 1024 })
    .withAutoCleanup(false)
    .withAutoRemove(false)
    .withEntrypoint(["/bin/sh", "-c"])
    .withCommand(["trap 'exit 0' TERM; echo redpact-unit-ready; while :; do sleep 1; done"])
    .withWorkingDir("/workspace")
    .withWaitStrategy(Wait.forLogMessage("redpact-unit-ready"))
    .withStartupTimeout(60000)
    .start()
  process.stdout.write(JSON.stringify({ containerId: container.getId() }))
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : "Unit container preparation failed")
  process.exitCode = 1
}
