import { z } from "zod"
import { settingsSchema } from "./settings-schema.js"
import { trackingSchema } from "./tracking-schema.js"
import type { SettingsResult } from "./types/settings.js"
export const settingsExample = JSON.stringify(
  {
    composeFiles: ["compose.yaml"],
    services: ["app"],
    dependencies: {
      payments: {
        kind: "mock",
        services: ["payments"],
        env: { app: { PAYMENTS_URL: "http://payments:8080" } },
      },
    },
    tests: {
      directory: "integration",
      env: { APP_URL: { service: "app", port: 3000, scheme: "http" } },
    },
  },
  null,
  2,
)
export function describeSettings() {
  return {
    path: ".redpact/settings.json",
    format: "json",
    schema: z.toJSONSchema(settingsSchema, { io: "input" }),
    example: settingsExample,
    preferenceFiles: {
      tracking: {
        path: ".redpact/tracking.json",
        root: "rulesRoot",
        schema: z.toJSONSchema(trackingSchema),
      },
    },
    workflow: [
      "Preserve existing unrelated settings and omitted environment defaults. Write one fixed project configuration in rulesRoot/.redpact/settings.json. All linked worktrees share it. Compose, Dockerfile and test paths resolve in the execution checkout.",
      "Declare root services and one fixed definition for each dependency. Compose provisions managed services and mocks. shared-local and remote dependencies declare existing connections and never provision containers.",
      "Declare only the variables needed by Integration and Playwright in tests.env. Both runners receive these values; application environment values are not inherited. Use secret references for credentials.",
      "Call configure validate with the execution path. Validation creates a plan but never runs containers, establishes readiness or grants approval.",
      "run_tests executes Integration. Unit and Playwright use their dedicated UI/API. Each run owns fresh resources and cleanup.",
    ],
    limits: [
      "Strict JSON; no mode catalogs, worktree overlays, execution selections, compatibility readers or automatic migrations.",
      "Existing settings must be manually rewritten for this contract. Historical runtime data uses only the current format.",
    ],
  }
}
export function publicSettings(result: SettingsResult) {
  return {
    valid: result.valid,
    file: result.file,
    issues: result.issues,
    digest: result.digest,
    ...(result.bundle
      ? { bundle: { files: result.bundle.files.map(({ path, sha256 }) => ({ path, sha256 })) } }
      : {}),
    ...(result.plan ? { plan: result.plan } : {}),
  }
}
