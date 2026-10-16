import { randomUUID } from "node:crypto"
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { tryLock } from "fs-native-extensions"
import { z } from "zod"
import { createLifecycleLog } from "./lifecycle-log.js"

const ownerSchema = z.object({
  pid: z.number().int().positive().max(2147483647),
  startedAt: z.iso.datetime(),
})

function locked(path: string, reason = "active_guard") {
  return new Error(
    `State directory is locked: ${path}. Writer recovery refused (${reason}). Another writer is running or its owner cannot be verified. Stop its owner before manual recovery.`,
  )
}

function readOwner(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

function recoverOwner(path: string, recovered: (pid: number) => void) {
  const source = readOwner(path)
  if (source === undefined) {
    return
  }
  let owner: z.infer<typeof ownerSchema>
  try {
    owner = ownerSchema.parse(JSON.parse(source))
  } catch {
    throw locked(path, "invalid_owner_metadata")
  }
  try {
    process.kill(owner.pid, 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      // The OS guard excludes other reclaimers. Preserve the original before unlinking.
      linkSync(path, `${path}.stale-${randomUUID()}`)
      unlinkSync(path)
      recovered(owner.pid)
      return
    }
    throw locked(path, `owner_probe_${(error as NodeJS.ErrnoException).code ?? "unknown"}`)
  }
  throw locked(path, "owner_pid_alive_or_reused")
}

export function acquireWriterLock(root: string) {
  const path = join(root, ".writer.lock")
  // Never unlink this inode: all generations must contend on the same OS lock.
  // The kernel releases it even after SIGKILL, without a timeout that can evict a live writer.
  const guard = openSync(join(root, ".writer.guard"), "a+", 0o600)
  const source = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    if (!tryLock(guard)) {
      throw locked(path)
    }
    recoverOwner(path, (ownerPid) =>
      createLifecycleLog(root)("runtime.writer.recovered", { ownerPid }),
    )
    const descriptor = openSync(temporary, "wx", 0o600)
    try {
      writeFileSync(descriptor, source)
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    // Keep the wx-era marker contract; an older runtime can still win this race.
    try {
      linkSync(temporary, path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw locked(path)
      }
      throw error
    }
  } catch (error) {
    closeSync(guard)
    throw error
  } finally {
    try {
      unlinkSync(temporary)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // A private temporary file is not an owner; retain it if cleanup is unavailable.
        process.emitWarning(
          new Error(`Could not remove writer temporary file: ${temporary}`, { cause: error }),
        )
      }
    }
  }
  let closed = false
  return () => {
    if (closed) {
      return
    }
    closed = true
    try {
      if (readOwner(path) !== source) {
        throw new Error(`Writer ownership changed: ${path}; refusing to remove it`)
      }
      unlinkSync(path)
    } finally {
      closeSync(guard)
    }
  }
}
