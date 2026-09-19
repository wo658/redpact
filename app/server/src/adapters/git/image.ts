import * as fs from "node:fs"
import { constants } from "node:fs"
import { lstat, open } from "node:fs/promises"
import { extname, isAbsolute, join } from "node:path"
import git from "isomorphic-git"
import type {
  GitImage,
  GitImageOptions,
  GitImageQuery,
  GitImageSide,
} from "../../core/types/git.js"
import { captureGit } from "./capture.js"
import { comparisonBase } from "./comparison-base.js"
import { gitContext, gitRevision } from "./context.js"
import { mediaTypes } from "./image-formats.js"

const limit = 5 * 1024 * 1024
async function workingBytes(root: string, path: string) {
  let current = root
  for (const part of path.split("/")) {
    current = join(current, part)
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error("Image preview requires a regular file without symlinks")
    }
  }
  const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile()) {
      throw new Error("Image preview requires a regular file")
    }
    if (info.size > limit) {
      throw new Error("Image preview exceeds 5 MiB")
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
      throw new Error("Image preview exceeds 5 MiB")
    }
    return buffer.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}

async function side(
  read: () => Promise<Uint8Array | null>,
  mediaType: string,
): Promise<GitImageSide> {
  try {
    const bytes = await read()
    if (bytes === null) {
      return null
    }
    return { dataUrl: `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}` }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    return { error: error instanceof Error ? error.message : "Image preview unavailable" }
  }
}

export async function readImage(
  projectPath: string,
  path: string,
  mainBranch?: string | null,
  options: GitImageOptions = {},
): Promise<GitImage> {
  validatePath(path)
  const mediaType = mediaTypes[extname(path).toLowerCase()]
  if (!mediaType) {
    throw new Error("Unsupported image extension")
  }
  const ctx = await gitContext(projectPath)
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  )
  const head = await gitRevision(ctx)
  const baseRevision =
    (options.scope && options.scope !== "all") || mainBranch === undefined
      ? head
      : await comparisonBase(ctx.root, head, mainBranch, env)
  const beforeRef = options.scope === "unstaged" ? "index" : baseRevision
  return {
    ...(baseRevision ? { baseRevision } : {}),
    before: await side(
      () => blobBytes(ctx.root, ctx.args, beforeRef, options.oldPath ?? path),
      mediaTypes[extname(options.oldPath ?? path).toLowerCase()] ?? mediaType,
    ),
    after: await side(
      () =>
        options.scope === "staged"
          ? blobBytes(ctx.root, ctx.args, "index", path)
          : workingBytes(ctx.root, path),
      mediaType,
    ),
  }
}

async function blobBytes(
  root: string,
  args: { fs: unknown; gitdir: string },
  revision: string | null | undefined,
  path: string,
) {
  validatePath(path)
  if (!revision) {
    return null
  }
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_LITERAL_PATHSPECS: "1",
    GIT_OPTIONAL_LOCKS: "0",
  }
  const command =
    revision === "index"
      ? ["ls-files", "--stage", "-z", "--", path]
      : ["ls-tree", "-z", revision, "--", path]
  const listing = await captureGit(
    ["-C", root, "-c", "core.fsmonitor=false", ...command],
    env,
    16384,
  )
  if (!listing.stdout) {
    return null
  }
  const entry = listing.stdout.match(
    revision === "index" ? /^100[0-7]{3} ([a-f0-9]+) 0\t/ : /^100[0-7]{3} blob ([a-f0-9]+)\t/,
  )
  if (!entry) {
    throw new Error("Image preview requires a regular Git blob")
  }
  const size = await captureGit(["-C", root, "cat-file", "-s", entry[1]], env, 128)
  if (Number(size.stdout.trim()) > limit) {
    throw new Error("Image preview exceeds 5 MiB")
  }
  return (await git.readBlob({ ...args, fs: args.fs as typeof fs, oid: entry[1] })).blob
}

function validatePath(path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path
      .split("/")
      .some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")
  ) {
    throw new Error("Git file paths must be repository-relative without traversal")
  }
}

export async function readCommittedImage(
  commonGitdir: string,
  query: GitImageQuery,
): Promise<GitImage> {
  validatePath(query.path)
  validatePath(query.oldPath ?? query.path)
  for (const revision of [query.before, query.after]) {
    if (revision !== undefined && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) {
      throw new Error("A full object ID is required")
    }
  }
  const mediaType = mediaTypes[extname(query.path).toLowerCase()]
  if (!mediaType) {
    throw new Error("Unsupported image extension")
  }
  const args = { fs, gitdir: commonGitdir }
  return {
    before: await side(
      () => blobBytes(commonGitdir, args, query.before, query.oldPath ?? query.path),
      mediaTypes[extname(query.oldPath ?? query.path).toLowerCase()] ?? mediaType,
    ),
    after: await side(() => blobBytes(commonGitdir, args, query.after, query.path), mediaType),
  }
}
