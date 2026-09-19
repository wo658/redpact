import { createHash } from "node:crypto"
import { lstat, open, readFile, readlink } from "node:fs/promises"
import { join } from "node:path"
import { readGit } from "./native-read.js"

export async function needsNativeIndex(gitdir: string) {
  try {
    const file = await open(join(gitdir, "index"), "r")
    try {
      const header = Buffer.alloc(8)
      const { bytesRead } = await file.read(header, 0, header.length, 0)
      return (
        bytesRead === 8 && header.toString("ascii", 0, 4) === "DIRC" && header.readUInt32BE(4) > 2
      )
    } finally {
      await file.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false
    }
    throw error
  }
}

function blobs(output: string, index: boolean) {
  const result = new Map<string, string>()
  for (const record of output.split("\0")) {
    if (!record) {
      continue
    }
    const tab = record.indexOf("\t")
    const [mode, second, third] = record.slice(0, tab).split(" ")
    if (index && third !== "0") {
      throw new Error("Unmerged Git index cannot be represented as a single staged blob")
    }
    if (mode !== "160000") {
      result.set(record.slice(tab + 1), index ? second : third)
    }
  }
  return result
}

async function workingOid(root: string, path: string) {
  const absolute = join(root, path)
  try {
    const info = await lstat(absolute)
    if (!info.isFile() && !info.isSymbolicLink()) {
      return undefined
    }
    const content = info.isSymbolicLink()
      ? Buffer.from(await readlink(absolute))
      : await readFile(absolute)
    return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

export async function nativeStatus(root: string, revision: string | null) {
  const [status, staged, head] = await Promise.all([
    readGit(root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--no-renames",
      "--untracked-files=all",
      "--ignore-submodules=all",
    ]),
    readGit(root, ["ls-files", "--stage", "-z"]),
    revision ? readGit(root, ["ls-tree", "-r", "-z", revision]) : Promise.resolve(""),
  ])
  const indexBlobs = blobs(staged, true)
  const headBlobs = blobs(head, false)
  const changes = []
  for (const record of status.split("\0")) {
    if (!record) {
      continue
    }
    const path = record.slice(3)
    const oid = await workingOid(root, path)
    // Preserve the public status-matrix equality codes across both readers.
    const entries = [undefined, headBlobs.get(path), oid, indexBlobs.get(path)]
    const [head, worktree, stage] = entries.slice(1).map((value) => entries.indexOf(value))
    if (head !== worktree || worktree !== stage) {
      changes.push({ path, head, worktree, stage })
    }
  }
  return changes
}

export async function nativeIndexFile(root: string, path: string) {
  const oid = blobs(await readGit(root, ["ls-files", "--stage", "-z", "--", path]), true).get(path)
  if (!oid) {
    return null
  }
  return readGit(root, ["cat-file", "blob", oid])
}
