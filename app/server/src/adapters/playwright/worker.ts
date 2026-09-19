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
  const image = await GenericContainer.fromDockerfile(spec.assets, "Dockerfile").build(
    "redpact-playwright:1.63.0-v1",
    { deleteOnExit: false },
  )
  const container = await image
    .withLabels({
      "io.redpact.owner": spec.ownerId,
      "io.redpact.capture": spec.id,
      "io.redpact.capture-side": spec.side,
    })
    .withEnvironment({ REDPACT_REDACT_VALUES: JSON.stringify(spec.redactions ?? []) })
    .withEnvironment({ REDPACT_UI_LANGUAGE: spec.uiLanguage })
    .withResourcesQuota({ memory: spec.limits.memoryMiB / 1024 })
    .withAutoCleanup(false)
    .withAutoRemove(false)
    .withNetworkMode(`container:${spec.targetId}`)
    .withSharedMemorySize(Math.min(1024, Math.floor(spec.limits.memoryMiB / 2)) * 1024 * 1024)
    // Private host snapshots must remain readable by the container's unprivileged user.
    .withCopyDirectoriesToContainer([{ source: spec.tests, target: "/review/tests", mode: 0o755 }])
    .withCopyContentToContainer([{ content: spec.config, target: "/review/playwright.config.cjs" }])
    .withEntrypoint(["/bin/sh", "-c"])
    .withCommand(["trap 'exit 0' TERM; echo redpact-capture-ready; while :; do sleep 1; done"])
    .withWaitStrategy(Wait.forLogMessage("redpact-capture-ready"))
    .withStartupTimeout(60000)
    .start()
  process.stdout.write(JSON.stringify({ containerId: container.getId() }))
} catch (e) {
  process.stderr.write(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
}
