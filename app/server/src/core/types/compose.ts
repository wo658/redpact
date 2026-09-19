// Only fields inspected by Redpact are modeled; Compose remains the effective-model authority.
export type ComposePort = {
  target: number
  published?: string | number
  protocol?: string
  host_ip?: string
}
type Resource = { external?: boolean; name?: string; driver?: string; driver_opts?: unknown }
export type Build = {
  context: string
  dockerfile?: string
  args?: Record<string, string>
  [key: string]: unknown
}
export type ComposeService = {
  environment?: Record<string, string | number | null> | string[]
  ports?: (number | string | ComposePort)[]
  volumes?: (string | { type: string; source?: string })[]
  deploy?: { replicas?: number; [key: string]: unknown }
  scale?: number
  build?: string | Build
  profiles?: string[]
  healthcheck?: { test?: string[]; disable?: boolean }
  depends_on?: Record<string, { condition: string }>
  [key: string]: unknown
}
export type ComposeModel = {
  services: Record<string, ComposeService>
  volumes?: Record<string, Resource>
  networks?: Record<string, Resource>
  include?: unknown
  secrets?: unknown
  configs?: unknown
}
export type EffectiveCompose = Omit<ComposeModel, "services"> & {
  services: Record<
    string,
    Pick<ComposeService, "profiles" | "healthcheck" | "depends_on" | "image"> & {
      ports?: ComposePort[]
      build?: Build
    }
  >
}
