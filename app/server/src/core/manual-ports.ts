import type { EffectiveCompose } from "./types/compose.js"
import type { Environment } from "./types/environment.js"

// Compose host publications are inspection endpoints, isolated from the runner network.
export function applyHostPorts(input: EffectiveCompose, record: Environment): EffectiveCompose {
  const model = {
    ...input,
    services: Object.fromEntries(
      Object.entries(input.services).map(([name, service]) => [name, { ...service }]),
    ),
  }
  const ports = Object.values(record.specification.dependencies).flatMap(
    (dependency) => dependency.hostPorts ?? [],
  )
  for (const [name, service] of Object.entries(model.services)) {
    service.ports = (service.ports ?? []).map((port) => {
      const fixed =
        record.lifecycle === "manual" &&
        record.manualScope === "main" &&
        (port.protocol ?? "tcp") === "tcp"
          ? ports.find((item) => item.service === name && item.target === port.target)
          : undefined
      return { ...port, published: fixed ? String(fixed.published) : "0" }
    })
  }
  if (record.lifecycle === "manual" && record.manualScope === "main") {
    for (const port of ports) {
      const service = model.services[port.service]
      if (
        !service?.ports?.some(
          (item) => item.target === port.target && (item.protocol ?? "tcp") === "tcp",
        )
      ) {
        throw new Error(
          `Fixed host port ${port.service}:${port.target} requires a TCP Compose publication`,
        )
      }
    }
  }
  return model
}
