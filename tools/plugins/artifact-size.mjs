import assert from "node:assert/strict"

export const maxPluginArchiveBytes = 50 * 1024 * 1024

export function assertPluginArchiveSize(archive) {
  assert(
    archive.byteLength <= maxPluginArchiveBytes,
    `Plugin archive exceeds the Codex 50 MiB installation limit: ${archive.byteLength} bytes`,
  )
}
