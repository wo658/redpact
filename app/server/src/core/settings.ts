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
      env: { APP_URL: "http://app.redpact.test:3000" },
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
      "Preserve existing unrelated settings and omitted environment defaults. Use redpact settings get --scope project --path PATH for authored values and the revision. Apply partial changes with redpact settings patch --scope project --path PATH --revision REVISION --patch-stdin; use --create instead of --revision for an absent document. All linked worktrees share the primary settings root. Compose, Dockerfile and test paths resolve in the execution checkout.",
      "Declare root services and one fixed definition for each dependency. Compose provisions managed services and mocks. shared-local and remote dependencies declare existing connections and never provision containers.",
      "Declare only the variables needed by Integration and Playwright in tests.env. Both runners receive these values; application environment values are not inherited. Set direct key-value strings through settings patch. Direct nonempty values are masked in execution text; settings and captured source remain plaintext. Secret and endpoint bindings are unsupported; use literal strings.",
      "Call redpact settings validate --scope project --path PATH with the execution path. Validation creates a plan but never runs containers, establishes readiness or grants approval.",
      "Request execution through redpact tests run with --kind unit, integration or playwright and the execution path; Playwright requires a declared target. Read redpact runs show for recorded evidence. Ask requests require explicit human approval in the connected viewer. Each run owns fresh resources and cleanup.",
    ],
    limits: [
      "Strict JSON; no mode catalogs, worktree overlays, execution selections, compatibility readers or automatic migrations.",
      "Use revision-checked settings patch to correct schema-invalid documents or settings repair for malformed JSON. Repair preserves the original backup. Historical runtime data upgrades through ordered startup migrations.",
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
