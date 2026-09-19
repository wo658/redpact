import { readFileSync } from "node:fs"

// This provider is the only place that knows how the execution environment supplies addresses.
export function connection(service, port) {
  const file = process.env.TEST_CONNECTIONS_FILE ?? process.env.REDPACT_CONNECTIONS_FILE
  if (!file) {
    throw new Error("Set TEST_CONNECTIONS_FILE when running outside Redpact")
  }
  const data = JSON.parse(readFileSync(file, "utf8"))
  if (data.version !== 1) {
    throw new Error("Unsupported connection file version")
  }
  if (!Object.hasOwn(data.services ?? {}, service)) {
    throw new Error(`Unavailable service: ${service}`)
  }
  const ports = data.services[service].ports ?? {}
  const key =
    port === undefined && Object.keys(ports).length === 1 ? Object.keys(ports)[0] : String(port)
  const endpoint = Object.hasOwn(ports, key) ? ports[key] : undefined
  if (!endpoint) {
    throw new Error(`Select an exposed port for service: ${service}`)
  }
  if (
    typeof endpoint.host !== "string" ||
    !endpoint.host ||
    !Number.isInteger(endpoint.port) ||
    endpoint.port < 1 ||
    endpoint.port > 65535
  ) {
    throw new Error(`Invalid endpoint for service: ${service}`)
  }
  return endpoint
}
