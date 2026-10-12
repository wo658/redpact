import { z } from "zod"

export const fetchResult = z.object({ remotes: z.array(z.string()) })

export const graphQuery = z.object({
  ref: z.union([z.string(), z.array(z.string())]).optional(),
  cursor: z.string().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})
export const oid = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
export const graphPage = z.object({
  commits: z.array(
    z.object({
      oid,
      parents: z.array(oid),
      kind: z.literal("commit"),
      message: z.string(),
      author: z.object({ name: z.string() }),
      authoredAt: z.string(),
      committedAt: z.string(),
    }),
  ),
  refs: z.array(
    z.object({ name: z.string(), target: oid, kind: z.enum(["head", "remote", "tag", "current"]) }),
  ),
  hasMore: z.boolean(),
  cursor: z.string().optional(),
})

export const commitDiff = z.object({
  available: z.boolean(),
  revision: oid,
  baseRevision: oid.optional(),
  patch: z.string(),
  omitted: z.array(z.string()),
})

export const imagePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path
        .split("/")
        .some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git"),
    "Expected a repository-relative image path",
  )
export const imageQuery = z.object({
  path: imagePath.regex(/\.(png|jpe?g|svg|gif|webp|avif|bmp|ico)$/i),
  oldPath: imagePath.optional(),
  before: oid.optional(),
  after: oid,
})
export const imageComparison = z.object({
  before: z.union([z.object({ dataUrl: z.string() }), z.object({ error: z.string() })]).nullable(),
  after: z.union([z.object({ dataUrl: z.string() }), z.object({ error: z.string() })]).nullable(),
})
