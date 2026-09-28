import { DockerComposeEnvironment } from "testcontainers"

process.once("disconnect", () => {
  // A parent crash must not leave a detached Compose CLI creating resources after recovery.
  try {
    process.kill(-process.pid, "SIGKILL")
  } catch {
    process.exit(1)
  }
})
process.channel?.unref()

// The child bounds Compose startup without putting resolved secrets in arguments or files.
let input = ""
for await (const chunk of process.stdin) {
  input += chunk
}
const spec = JSON.parse(input)
try {
  const environment = await new DockerComposeEnvironment(spec.directory, spec.files)
    .withProjectName(spec.projectName)
    .withProfiles(...spec.profiles)
    .withEnvironment(spec.variables)
    .withAutoCleanup(false)
    .withStartupTimeout(spec.timeoutMs)
    .withBuild()
    .up()
  const endpoints: Record<string, { host: string; port: number }> = {}
  for (const [service, ports] of Object.entries(spec.ports as Record<string, number[]>)) {
    if (!ports.length) {
      continue
    }
    const container = environment.getContainer(`${service}-1`)
    for (const port of ports) {
      endpoints[`${service}:${port}`] = {
        host: container.getHost(),
        port: container.getMappedPort(port),
      }
    }
  }
  process.stdout.write(JSON.stringify({ endpoints }))
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Compose startup failed"}\nResources are retained.\n`,
  )
  process.exitCode = 1
}
