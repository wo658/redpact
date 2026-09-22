import { gt, prerelease, valid } from "semver"
import { z } from "zod"

export const updateStatusSchema = z.object({
  currentVersion: z.string(),
  version: z.string().nullable(),
  busy: z.boolean(),
  checkedAt: z.string().nullable(),
  error: z.string().nullable(),
  supported: z.boolean(),
  canInstall: z.boolean(),
  installError: z.string().nullable(),
})

export function newerRelease(current: string, tags: Record<string, string>): string | null {
  if (!valid(current)) {
    throw new Error("Invalid installed version")
  }
  const candidates = prerelease(current) ? [tags.latest, tags.beta] : [tags.latest]
  let newer: string | null = null
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    const version = valid(candidate)
    if (!version) {
      throw new Error("Invalid registry version")
    }
    if (!prerelease(current) && prerelease(version)) {
      continue
    }
    if (gt(version, current) && (!newer || gt(version, newer))) {
      newer = version
    }
  }
  if (!candidates.some(Boolean)) {
    throw new Error("No release channel is available")
  }
  return newer
}
