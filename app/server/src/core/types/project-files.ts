import type { z } from "zod"
import type { projectEntry } from "../project-files-schema.js"

export type ProjectEntry = z.infer<typeof projectEntry>
export type ProjectFiles = { read(id: string, path: string): Promise<ProjectEntry> }
