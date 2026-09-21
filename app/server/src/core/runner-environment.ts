import type { Environment } from "./types/environment.js"
import type { ComposeSettings } from "./types/settings.js"

export function runnerServiceHost(service: string) {
  return `${service}.redpact.test`
}

export function runnerEnvironment(
  settings: ComposeSettings,
  secrets: Record<string, string | undefined>,
) {
  const values: Record<string, string> = {}
  for (const [key, binding] of Object.entries(settings.tests.env)) {
    if ("service" in binding) {
      if (binding.value === "host") {
        values[key] = runnerServiceHost(binding.service)
      } else if (binding.value === "port") {
        values[key] = String(binding.port)
      } else {
        values[key] =
          `${binding.scheme ?? "http"}://${runnerServiceHost(binding.service)}:${binding.port}`
      }
    } else if ("secret" in binding) {
      const value = secrets[binding.secret]
      if (value === undefined) {
        throw new Error(`Missing runner secret: ${binding.secret}`)
      }
      values[key] = value
    } else {
      values[key] = binding.value
    }
  }
  return values
}

export function runnerConnections(environment?: Pick<Environment, "plan" | "endpoints">) {
  return {
    version: 1 as const,
    services: Object.fromEntries(
      (environment?.plan?.activeServices ?? []).map((name) => [
        name,
        {
          ports: Object.fromEntries(
            Object.keys(environment?.endpoints ?? {})
              .filter((key) => key.startsWith(`${name}:`))
              .map((key) => [
                key.slice(name.length + 1),
                { host: runnerServiceHost(name), port: Number(key.slice(name.length + 1)) },
              ]),
          ),
        },
      ]),
    ),
  }
}
