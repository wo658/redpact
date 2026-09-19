import { z } from "zod"
import { instanceSettingsSchema } from "../core/instance-schema.js"
import { problem } from "../core/problems.js"
import { describeSettings, publicSettings } from "../core/settings.js"
import { testSelectionSchema } from "../core/settings-schema.js"
import type { SettingsService, TestSelection } from "../core/types/settings.js"
import type { Services } from "./services.js"
export const configureInput = z.strictObject({
  selection: testSelectionSchema
    .optional()
    .describe(
      "Optional services and dependency modes for inspect/validate plan preview; not saved and never inferred from selection.json by configure. Not allowed for describe. Select every configured dependency exactly once.",
    ),
  action: z
    .enum(["describe", "inspect", "validate"])
    .describe(
      "describe returns the schema, examples and file-authoring workflow; inspect reads normalized settings, diagnostics and discovered tests; validate checks authored files and an optional selection without writing or executing.",
    ),
})
export async function configureSettings(
  service: SettingsService,
  action: z.infer<typeof configureInput>["action"],
  environmentAvailable = false,
  selection?: TestSelection,
) {
  if (action === "describe" && selection) {
    problem("invalid_input", "selection is inspect/validate-only")
  }
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
        "Write the project-wide .redpact/settings.json in rulesRoot, then call configure validate. For linked worktree dependency changes, author .redpact/dependencies.override.json in projectRoot using specification.dependencyOverrides; inspect returns a reviewable promotion candidate.",
      ],
    }
  }
  const result = await service.read(selection)
  return {
    ...context,
    validation: publicSettings(result),
    dependencies: Object.fromEntries(
      Object.entries(result.settings?.dependencies ?? {}).map(([name, definition]) => [
        name,
        Object.keys(definition.modes),
      ]),
    ),
    deferredChecks: ["compose-effective-model", "images", "secrets", "docker", "readiness"],
    ...(result.plan ? { selection, plan: result.plan } : {}),
    ...(action === "inspect" && result.settings ? { settings: result.settings } : {}),
    ...(action === "inspect" && result.valid && result.promotion
      ? { promotion: result.promotion }
      : {}),
    nextSteps: result.valid
      ? [
          "Configuration is valid. Before completing requested external setup, check declared key availability and use request_keys for necessary missing authentication inputs. Readiness and approval remain unchecked. For unitTests.command execution use the Unit Test viewer or the unit-test HTTP API; run_tests is only for managed integration tests and requires configured Compose services. When managed execution is requested, call run_tests with path and an explicit selection or previously saved choices. Poll get_run for results and cleanup state. Temporary environments are removed after execution. Shared local infrastructure belongs outside worktree environments and can be selected through shared-local dependency modes.",
        ]
      : [
          "Call configure describe for the schema and initial setup workflow. Inspect the application and existing files, then author or repair .redpact/settings.json. For managed integration execution, also author missing Dockerfile and Compose definitions; unit-only configuration needs no Compose. Correct the reported file/field errors, then call configure validate.",
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
  const result = await configureSettings(
    settings,
    input.action,
    Boolean(services.environments),
    input.selection,
  )
  const tests: { files: string[]; error?: string } = { files: [] }
  if (input.action !== "describe" && services.localFiles) {
    const validation = await settings.read(input.selection)
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
              "Edit projects in the instance settings file to observe absolute project directories. Git worktrees and tests.directory are discovered automatically; existing history is retained when paths are removed.",
          },
        }
      : {}),
    ...(input.action !== "describe" ? { tests } : {}),
    ...(target ? { worktreeId: target.worktree.id, projectId: target.worktree.projectId } : {}),
  }
}
