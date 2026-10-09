import { parseDocument } from "yaml"
import type { z } from "zod"
import { trackingSchema } from "../../core/tracking-schema.js"
import type { PreferenceFiles } from "../../core/types/preferences.js"
import { readProjectFile } from "./bundle.js"

async function read<T>(root: string, file: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const source = await readProjectFile(root, `.redpact/${file}`)
    const value: unknown = JSON.parse(source)
    const parsed = parseDocument(source, { uniqueKeys: true })
    if (parsed.errors.length || parsed.warnings.length) {
      throw new Error("Invalid JSON or duplicate keys")
    }
    return schema.parse(value)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw Object.assign(new Error(`Invalid .redpact/${file}: ${(error as Error).message}`), {
      code: "invalid_input",
    })
  }
}

export const preferenceFiles: PreferenceFiles = {
  tracking: async (root, previous) =>
    (await read(root, "tracking.json", trackingSchema)) ?? previous ?? null,
}
