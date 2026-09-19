import { ApiError } from "@/lib/api"

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const details = error.details as
      | { validation?: { issues?: Array<{ path?: string; message?: string }> } }
      | undefined
    const validation = details?.validation
    if (Array.isArray(validation?.issues)) {
      return validation.issues
        .map((issue) => `${issue.path ?? ""}: ${issue.message ?? ""}`)
        .join("\n")
    }
  }
  return error instanceof Error ? error.message : String(error)
}
