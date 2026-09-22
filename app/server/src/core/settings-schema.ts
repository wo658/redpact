import { matchesGlob } from "node:path"
import { z } from "zod"
import { variableName } from "./settings-values.js"
import { unitTestSettingsSchema } from "./unit-test-schema.js"
export const name = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
export const projectPath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      !path.includes("\\") &&
      !path.includes(":") &&
      path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "Use a normalized project-relative path",
  )
const names = z
  .array(name)
  .max(100)
  .refine((v) => new Set(v).size === v.length, "Duplicate names")
const bounded = <T extends z.ZodType>(key: z.ZodString, value: T, max: number) =>
  z.record(key, value).refine((v) => Object.keys(v).length <= max, `Maximum ${max} entries`)
const serviceVariableName = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
export const secretBinding = z.strictObject({ secret: variableName })
export const containerBinding = z.union([
  z.string().max(10000),
  secretBinding,
  z.strictObject({ unset: z.literal(true) }),
])
export const testEndpoint = z.strictObject({
  service: name,
  port: z.number().int().min(1).max(65535),
  scheme: z.enum(["http", "https"]),
})
export const dependencyModeName = z
  .string()
  .regex(/^(isolated|shared-local|remote|mock)$/, "Use isolated, shared-local, remote or mock")
const explanation = z.string().trim().min(1).max(2000)
const evidence = z
  .array(
    z.strictObject({
      path: projectPath,
      line: z.number().int().min(1).max(10000000).optional(),
    }),
  )
  .min(1)
  .max(20)
export const dependencyDefinition = z
  .strictObject({
    description: explanation.optional(),
    kind: z.enum(["isolated", "mock", "shared-local", "remote"]),
    services: names.default([]),
    env: bounded(name, bounded(serviceVariableName, containerBinding, 100), 100).default({}),
  })
  .superRefine((dependency, ctx) => {
    if (dependency.kind === "isolated" && !dependency.services.length) {
      ctx.addIssue({
        code: "custom",
        path: ["services"],
        message: "Isolated requires actual dependency Compose services",
      })
    }
    if (["shared-local", "remote"].includes(dependency.kind) && dependency.services.length) {
      ctx.addIssue({
        code: "custom",
        path: ["services"],
        message: "External connections cannot provision Compose services",
      })
    }
  })
export const testSelectionSchema = z.strictObject({
  services: names.min(1),
  select: bounded(name, dependencyModeName, 100),
})
export const settingsShape = z.strictObject({
  services: names.default([]),
  applicationServices: bounded(
    name,
    z.strictObject({
      services: names.min(1),
      description: explanation.optional(),
    }),
    100,
  ).optional(),
  relationships: z
    .array(
      z.strictObject({
        from: name,
        to: z.strictObject({ kind: z.enum(["application", "dependency"]), name }),
        description: explanation,
        evidence,
      }),
    )
    .max(500)
    .optional(),
  playwright: z
    .strictObject({
      directory: projectPath.default("ui-tests"),
      targets: bounded(
        name,
        z.strictObject({
          scope: z.enum(["worktree", "project"]).default("project"),
          purpose: z.enum(["capture", "functional"]),
          testMatch: z.array(projectPath).min(1).max(30),
        }),
        20,
      ).refine(
        (targets) => Object.keys(targets).length > 0,
        "At least one Playwright target is required",
      ),
      service: name,
      port: z.number().int().min(1).max(65535),
      scheme: z.enum(["http", "https"]).default("http"),
      viewport: z
        .strictObject({
          width: z.number().int().min(320).max(3840),
          height: z.number().int().min(240).max(2160),
        })
        .default({ width: 1920, height: 1080 }),
      mobileViewport: z
        .strictObject({
          width: z.number().int().min(320).max(767),
          height: z.number().int().min(240).max(2160),
        })
        .default({ width: 390, height: 844 }),
      locale: z.string().min(2).max(40).default("en-US"),
      uiLanguage: z
        .string()
        .regex(/^[a-z]{2,3}$/)
        .default("en"),
      timezoneId: z.string().min(1).max(100).default("UTC"),
      colorScheme: z.enum(["light", "dark"]).default("light"),
      video: z.boolean().default(false),
      timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    })
    .optional(),
  unitTests: unitTestSettingsSchema.optional(),
  composeFiles: z
    .array(projectPath)
    .max(10)
    .refine((v) => new Set(v).size === v.length, "Duplicate Compose files")
    .default([]),
  dependencies: bounded(name, dependencyDefinition, 100).default({}),
  tests: z
    .strictObject({
      directory: projectPath.default("integration"),
      timeoutMs: z.number().int().min(1).max(60000).default(10000),
      env: bounded(
        variableName,
        z.union([z.string().max(10000), secretBinding, testEndpoint]),
        100,
      ).default({}),
    })
    .default({ directory: "integration", timeoutMs: 10000, env: {} }),
})
export const settingsSchema = settingsShape.superRefine(topologyIssues)
type TopologySettings = z.infer<typeof settingsShape>
function topologyIssues(settings: TopologySettings, ctx: z.RefinementCtx) {
  checkTestLocations(settings, ctx)
  const owners = applicationOwners(settings, ctx)
  checkDependencyOwnership(settings, owners, ctx)
  checkRelationships(settings, ctx)
}
function checkTestLocations(settings: TopologySettings, ctx: z.RefinementCtx) {
  const patterns = settings.unitTests?.patterns ?? []
  if (
    !patterns.some((pattern) =>
      integrationCandidates(settings.tests.directory).some((path) => matchesGlob(path, pattern)),
    )
  ) {
    return
  }
  ctx.addIssue({
    code: "custom",
    path: ["unitTests", "patterns"],
    message: "Unit test patterns cannot include integration test sources",
  })
}
function integrationCandidates(directory: string) {
  return [
    `${directory}/__redpact_test__`,
    `${directory}/__redpact_test__.test.ts`,
    `${directory}/__redpact_test__.test.js`,
    `${directory}/__redpact_test__.test.mjs`,
    `${directory}/test_redpact.py`,
  ]
}
function applicationOwners(settings: TopologySettings, ctx: z.RefinementCtx) {
  const owners = new Map<string, string>()
  for (const [application, definition] of Object.entries(settings.applicationServices ?? {})) {
    for (const service of definition.services) {
      if (owners.has(service)) {
        ctx.addIssue({
          code: "custom",
          path: ["applicationServices", application, "services"],
          message: `Compose service ${service} already belongs to application ${owners.get(service)}`,
        })
      }
      owners.set(service, application)
    }
  }
  return owners
}
function checkDependencyOwnership(
  settings: TopologySettings,
  owners: Map<string, string>,
  ctx: z.RefinementCtx,
) {
  for (const [dependency, definition] of Object.entries(settings.dependencies)) {
    for (const service of definition.services) {
      if (owners.has(service)) {
        ctx.addIssue({
          code: "custom",
          path: ["dependencies", dependency, "services"],
          message: `Compose service ${service} belongs to application ${owners.get(service)}, not a dependency`,
        })
      }
    }
  }
}
function checkRelationships(settings: TopologySettings, ctx: z.RefinementCtx) {
  const relationships = new Set<string>()
  for (const [index, relation] of (settings.relationships ?? []).entries()) {
    const path = ["relationships", index]
    if (!Object.hasOwn(settings.applicationServices ?? {}, relation.from)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "from"],
        message: `Unknown application service: ${relation.from}`,
      })
    }
    const targets =
      relation.to.kind === "application"
        ? (settings.applicationServices ?? {})
        : settings.dependencies
    if (!Object.hasOwn(targets, relation.to.name)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "to", "name"],
        message: `Unknown ${relation.to.kind}: ${relation.to.name}`,
      })
    }
    if (relation.to.kind === "application" && relation.from === relation.to.name) {
      ctx.addIssue({ code: "custom", path, message: "An application cannot depend on itself" })
    }
    const key = `${relation.from}:${relation.to.kind}:${relation.to.name}`
    if (relationships.has(key)) {
      ctx.addIssue({ code: "custom", path, message: "Duplicate relationship" })
    }
    relationships.add(key)
  }
}
