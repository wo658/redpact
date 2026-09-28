import type { Environment } from "./types/environment.js"

export function runnerServiceHost(service: string) {
  return `${service}.redpact.test`
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

// Capture policy is independent of how a value was authored or named.
export function environmentRedactions(record: Pick<Environment, "plan" | "settings">): string[] {
  const values = [
    ...Object.values(record.plan.bindings).flatMap(Object.values),
    ...Object.values(record.settings.tests.env),
  ].filter((value): value is string => typeof value === "string" && value.length > 0)
  return [...new Set(values)].sort((a, b) => b.length - a.length)
}
