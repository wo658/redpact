import { constants } from "node:fs"
import { type FileHandle, lstat, open } from "node:fs/promises"
import { join } from "node:path"
import type { RunLogReader, RunLogs } from "../../core/types/run-logs.js"

const limit = 256 * 1024

export function createRunLogReader(directory: string): RunLogReader {
  return async (id) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error("Invalid run ID")
    }
    const root = join(directory, "runs", id)
    try {
      const info = await lstat(root)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error("Invalid run directory")
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { stdout: null, stderr: null }
      }
      throw error
    }
    const [stdout, stderr] = await Promise.all([
      readStream(join(root, "stdout.log")),
      readStream(join(root, "stderr.log")),
    ])
    return { stdout, stderr }
  }
}

async function readStream(path: string): Promise<RunLogs["stdout"]> {
  let file: FileHandle
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
  try {
    if (!(await file.stat()).isFile()) {
      throw new Error("Invalid run log file")
    }
    const buffer = Buffer.alloc(limit + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length)
      if (!bytesRead) {
        break
      }
      length += bytesRead
    }
    return {
      text: buffer.subarray(0, Math.min(length, limit)).toString("utf8"),
      truncated: length > limit,
    }
  } finally {
    await file.close()
  }
}
