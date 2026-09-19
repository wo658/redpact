export type TestConnections = {
  version: 1
  services: Record<string, { ports: Record<string, { host: string; port: number }> }>
}
