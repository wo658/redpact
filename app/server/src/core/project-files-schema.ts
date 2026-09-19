import { z } from "zod"

export const projectEntry = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("directory"),
    path: z.string(),
    entries: z.array(z.object({ name: z.string(), kind: z.enum(["directory", "file"]) })),
  }),
  z.object({
    kind: z.literal("image"),
    path: z.string(),
    dataUrl: z.string(),
    content: z.string().optional(),
  }),
  z.object({ kind: z.literal("text"), path: z.string(), content: z.string() }),
  z.object({ kind: z.enum(["binary", "too_large"]), path: z.string() }),
])
