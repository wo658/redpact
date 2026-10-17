import { z } from "zod"
import { instanceSettingsSchema } from "../core/instance-schema.js"
import { problem } from "../core/problems.js"
import { describeSettings, publicSettings } from "../core/settings.js"
import type { SettingsService } from "../core/types/settings.js"
import type { Services } from "./services.js"
export const configureInput = z.strictObject({
  action: z
    .enum(["describe", "inspect", "validate"])
    .describe(
      "describe returns the schema, examples and CLI settings workflow; inspect reads normalized settings, diagnostics and discovered tests; validate checks authored files and the fixed execution plan without writing or executing.",
    ),
})
export async function configureSettings(
  service: SettingsService,
  action: z.infer<typeof configureInput>["action"],
  environmentAvailable = false,
) {
  const context = {
    action,
    projectRoot: service.projectRoot,
    rulesRoot: service.rulesRoot ?? service.projectRoot,
    environment: {
      readiness: "not_checked",
      provisioning: environmentAvailable ? "available" : "unsupported",
    },
  }
  if (action === "describe") {
    return {
      ...context,
      specification: describeSettings(),
      nextSteps: [
        "Inspect existing configuration and follow specification.workflow. For managed integration tests, inspect the application's build/start configuration and create or repair Dockerfile and Compose definitions as needed. Unit-only setup requires a Dockerfile for the runtime, dependency installation and source under /workspace; it does not require Compose.",
        "Use redpact settings get and redpact settings patch --scope project --path PATH with the returned revision (or --create for an absent document), then call redpact settings validate. All worktrees use this fixed configuration; execution files resolve in the selected checkout.",
      ],
    }
  }
  const result = await service.read()
  return {
    ...context,
    validation: publicSettings(result),
    dependencies: Object.fromEntries(
      Object.entries(result.settings?.dependencies ?? {}).map(([name, definition]) => [
        name,
        [definition.kind],
      ]),
    ),
    deferredChecks: ["compose-effective-model", "images", "docker", "readiness"],
    ...(result.plan ? { plan: result.plan } : {}),
    ...(action === "inspect" && result.settings ? { settings: result.settings } : {}),
    nextSteps: result.valid
      ? [
          "Configuration is valid. Readiness and approval remain unchecked. For unitTests.command execution use run_tests with kind=unit; use run_tests with kind=playwright with a declared target for browser verification. Under Ask policy, these MCP requests wait for explicit human approval in the connected web viewer. Read get_run for their evidence and cleanup; kind=integration requires configured Compose services. When managed execution is requested, call run_tests with path. Poll get_run for results and cleanup state. Temporary environments are removed after execution. Shared local infrastructure belongs outside worktree environments and is declared as a shared-local dependency.",
        ]
      : [
          "Call redpact settings describe --scope project --path PATH for the schema and setup workflow. Inspect the application, then use redpact settings get and revision-checked settings patch or settings repair. For managed integration execution, also author missing Dockerfile and Compose definitions; unit-only configuration needs no Compose. Correct the reported file/field errors, then call redpact settings validate --scope project --path PATH.",
        ],
  }
}

export async function configure(
  services: Services,
  input: z.infer<typeof configureInput> & { path?: string; worktreeId?: string },
) {
  if (input.path && input.worktreeId) {
    problem("invalid_input", "Choose path or worktreeId, not both")
  }
  const worktreeId = input.worktreeId ?? (!input.path ? services.defaultWorktreeId : undefined)
  const target = worktreeId ? await services.worktrees?.resolve(worktreeId) : undefined
  if (!input.path && !target && services.worktrees && input.action !== "describe") {
    problem("target_required", "Supply the project directory as path")
  }
  const settings = input.path
    ? await (
        services.localFiles ?? problem("settings_unsupported", "Local files service is unavailable")
      ).settings(input.path)
    : (target?.settings ?? services.settings)
  const result = await configureSettings(settings, input.action, Boolean(services.environments))
  const tests: { files: string[]; error?: string } = { files: [] }
  if (input.action !== "describe" && services.localFiles) {
    const validation = await settings.read()
    if (validation.valid && validation.settings) {
      try {
        tests.files = (
          await services.localFiles.readTests(
            settings.projectRoot,
            validation.settings.tests.directory,
          )
        ).map((file) => file.path)
      } catch (error) {
        tests.error = error instanceof Error ? error.message : "Cannot read tests"
      }
    }
  }
  const { projectRoot, ...guidance } = result
  return {
    ...guidance,
    ...(!services.worktrees || input.path || target ? { projectRoot } : {}),
    ...(services.observation
      ? {
          observation: {
            ...services.observation,
            projectsSchema: z.toJSONSchema(instanceSettingsSchema.shape.projects, { io: "input" }),
            guidance:
              "Use redpact settings patch --scope instance with the current revision to change observed absolute project directories in /projects. Git worktrees and tests.directory are discovered automatically; existing history is retained when paths are removed.",
          },
        }
      : {}),
    ...(input.action !== "describe" ? { tests } : {}),
    ...(target ? { worktreeId: target.worktree.id, projectId: target.worktree.projectId } : {}),
  }
}
