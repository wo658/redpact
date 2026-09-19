import type { Environment } from "./environment.js"

export type SecretStatus = { name: string; configured: boolean }
export type ProjectSecretStore = {
  project(id: string): Record<string, string>
  saveProject(id: string, values: Record<string, string>): void
  environment(id: string): Record<string, string> | undefined
  saveEnvironment(id: string, values: Record<string, string>): void
}
export type ProjectSecrets = {
  value(projectId: string, name: string): Promise<{ value: string }>
  request(projectId: string, names: string[]): Promise<{ token: string; inputs: SecretStatus[] }>
  submit(token: string, name: string, value: string): Promise<SecretStatus>
  list(projectId: string): Promise<SecretStatus[]>
  set(projectId: string, name: string, value: string): Promise<SecretStatus>
  resolve(record: Environment): Record<string, string>
}
