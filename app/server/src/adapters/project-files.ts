import { constants } from "node:fs"
import { lstat, open, opendir, realpath } from "node:fs/promises"
import { extname, join } from "node:path"
import { problem } from "../core/problems.js"
import type { ProjectEntry } from "../core/types/project-files.js"

import { mediaTypes } from "./git/image-formats.js"

const textLimit = 1024 * 1024
async function readEntry(root: string, path: string): Promise<ProjectEntry> {
  const mediaType = mediaTypes[extname(path).toLowerCase()]
  const limit = mediaType ? 5 * 1024 * 1024 : textLimit
  const parts = path ? path.split("/") : []
  if (
    path.includes("\\") ||
    path.includes("\0") ||
    parts.some((part) => !part || [".", "..", ".git"].includes(part.toLowerCase()))
  ) {
    problem("invalid_input", "A project-relative path without traversal is required")
  }
  let target = await realpath(root)
  for (const part of parts) {
    target = join(target, part)
    if ((await lstat(target)).isSymbolicLink()) {
      problem("invalid_input", "Symbolic links cannot be opened")
    }
  }
  const stat = await lstat(target)
  if (stat.isDirectory()) {
    const entries: { name: string; kind: "directory" | "file" }[] = []
    let count = 0
    for await (const entry of await opendir(target)) {
      if (++count > 5000) {
        problem("invalid_input", "Directory exceeds 5000 entries")
      }
      if (entry.name.toLowerCase() === ".git" || (!entry.isDirectory() && !entry.isFile())) {
        continue
      }
      entries.push({ name: entry.name, kind: entry.isDirectory() ? "directory" : "file" })
    }
    entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    return { kind: "directory", path, entries }
  }
  if (!stat.isFile()) {
    problem("invalid_input", "Only regular files can be opened")
  }
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const current = await file.stat()
    if (!current.isFile()) {
      problem("invalid_input", "Only regular files can be opened")
    }
    if (current.size > limit) {
      return { kind: "too_large", path }
    }
    const buffer = Buffer.alloc(limit + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      const chunk = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (!chunk.bytesRead) {
        break
      }
      bytesRead += chunk.bytesRead
    }
    if (bytesRead > limit) {
      return { kind: "too_large", path }
    }
    const bytes = buffer.subarray(0, bytesRead)
    if (mediaType) {
      return {
        kind: "image",
        path,
        dataUrl: `data:${mediaType};base64,${bytes.toString("base64")}`,
        ...(mediaType === "image/svg+xml" ? { content: bytes.toString("utf8") } : {}),
      }
    }
    if (bytes.includes(0)) {
      return { kind: "binary", path }
    }
    try {
      return {
        kind: "text",
        path,
        content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      }
    } catch {
      return { kind: "binary", path }
    }
  } finally {
    await file.close()
  }
}
export async function readProjectEntry(root: string, path: string): Promise<ProjectEntry> {
  try {
    return await readEntry(root, path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") {
      problem("not_found", "File or directory not found")
    }
    throw error
  }
}
