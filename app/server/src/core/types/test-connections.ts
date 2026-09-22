export type TestConnections = {
  runtime?: { ownerId: string; environmentId: string; network: string }
  version: 1
  services: Record<string, { ports: Record<string, { host: string; port: number }> }>
}
