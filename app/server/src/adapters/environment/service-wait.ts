import { getContainerRuntimeClient, StartupCheckStrategy } from "testcontainers"

// Compose services without a healthcheck need to run; published ports are not readiness gates.
export class ServiceWait extends StartupCheckStrategy {
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
