import { z } from "zod"

// Previous manual environments were created exclusively from the configured main checkout.
export function migrateManualEnvironmentScope(source: string, id: string): string {
  const record = z
    .strictObject({ version: z.literal(1), data: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(source))
  if (record.data.id !== id) {
    throw new Error("Mismatched environment record ID")
  }
  if (record.data.lifecycle !== "manual" || record.data.manualScope !== undefined) {
    return source
  }
  record.data.manualScope = "main"
  return `${JSON.stringify(record, null, 2)}\n`
}
