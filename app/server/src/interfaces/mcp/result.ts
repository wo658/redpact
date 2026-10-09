import { publicSettings } from "../../core/settings.js"
import type { SettingsResult } from "../../core/types/settings.js"
export const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
export const output = (value: object) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value as Record<string, unknown>,
})
export async function invoke(operation: () => unknown) {
  try {
    const value = await operation()
    return output(value as object)
  } catch (error) {
    return {
      ...output({
        error: error instanceof Error ? error.message : "Operation failed",
        ...(error instanceof Error && "code" in error ? { code: error.code } : {}),
        ...(error instanceof Error && "validation" in error
          ? { validation: publicSettings(error.validation as SettingsResult) }
          : {}),
      }),
      isError: true,
    }
  }
}
