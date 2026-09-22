import { join } from "node:path"

export const runtimePackageName = "@wo658/redpact"

export function runtimePackagePath(root: string) {
  return join(root, "@wo658", "redpact")
}
