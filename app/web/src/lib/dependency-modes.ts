export const dependencyModeNames = ["isolated", "shared-local", "remote", "mock"] as const

export function dependencyModeLabel(mode: string) {
  const labels: Record<string, string> = {
    isolated: "Per-environment",
    "shared-local": "Shared local",
    mock: "Mock",
    remote: "Remote connection",
  }
  return labels[mode] ?? mode
}
