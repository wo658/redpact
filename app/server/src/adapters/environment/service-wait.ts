import { getContainerRuntimeClient, StartupCheckStrategy } from "testcontainers"

// Compose services without a healthcheck need to run; published ports are not readiness gates.
export class ServiceWait extends StartupCheckStrategy {
  constructor(
    private readonly consume?: (message: string, source?: string) => void,
    private readonly complete?: (source: string) => void,
  ) {
    super()
  }

  override async waitUntilReady(container: Parameters<StartupCheckStrategy["waitUntilReady"]>[0]) {
    if (this.consume) {
      try {
        const client = await getContainerRuntimeClient()
        for (const source of ["stdout", "stderr"] as const) {
          const logs = await client.container.logs(container, {
            stdout: source === "stdout",
            stderr: source === "stderr",
          })
          logs.setEncoding("utf8")
          logs.on("data", (chunk) => this.consume?.(chunk.toString(), `${container.id}:${source}`))
          logs.once("end", () => this.complete?.(`${container.id}:${source}`))
          logs.on("error", (error) =>
            this.consume?.(`Log stream failed for ${container.id}: ${String(error)}\n`),
          )
        }
      } catch (error) {
        this.consume(`Log stream unavailable for ${container.id}: ${String(error)}\n`)
      }
    }
    return super.waitUntilReady(container)
  }

  async checkStartupState(...[, id]: Parameters<StartupCheckStrategy["checkStartupState"]>) {
    const client = await getContainerRuntimeClient()
    const { State } = await client.container.inspect(client.container.getById(id))
    if (!State.Running) {
      return "FAIL" as const
    }
    if (State.Health) {
      if (State.Health.Status === "healthy") {
        return "SUCCESS" as const
      }
      return State.Health.Status === "unhealthy" ? ("FAIL" as const) : ("PENDING" as const)
    }
    return "SUCCESS" as const
  }
}
