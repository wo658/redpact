import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { stringify } from "yaml"
import type { Environment } from "../../core/types/environment.js"
import { readComposeModel } from "../settings/bundle.js"
import type { ComposeModel } from "./compose-model.js"

export async function stageSelection(
  stage: string,
  record: Pick<Environment, "plan" | "settings">,
  secrets: NodeJS.ProcessEnv,
  sourceRoot = stage,
) {
  const plan = record.plan
  if (!plan) {
    throw new Error("Missing environment plan")
  }
  for (const name of plan.requiredSecrets) {
    if (secrets[name] === undefined) {
      throw new Error(`Missing secret reference: ${name}`)
    }
  }
  const { sources } = await readComposeModel(sourceRoot, record.settings.environment.compose.files)
  const active = new Set(plan.activeServices)
  const files: string[] = [],
    variables: Record<string, string> = {},
    redactions: string[] = []
  const usedNetworks = new Set<string>(["default"]),
    usedVolumes = new Set<string>()
  for (const source of sources) {
    for (const [id, service] of Object.entries(source.model.services)) {
      if (active.has(id)) {
        for (const name of Array.isArray(service.networks)
          ? (service.networks as string[])
          : Object.keys((service.networks ?? {}) as object)) {
          usedNetworks.add(name)
        }
        for (const volume of service.volumes ?? []) {
          const name = typeof volume === "string" ? volume.split(":")[0] : volume.source
          if (name) {
            usedVolumes.add(name)
          }
        }
      }
    }
  }
  for (const [index, source] of sources.entries()) {
    const model: ComposeModel = {
      services: Object.fromEntries(
        Object.entries(source.model.services)
          .filter(([id]) => active.has(id))
          .map(([id, original]) => {
            const service = structuredClone(original)
            const environment = service.environment as Record<string, unknown> | undefined
            for (const key of Object.keys(plan.bindings[id] ?? {})) {
              if (environment) {
                delete environment[key]
              }
            }
            return [id, service]
          }),
      ),
    }
    if (source.model.networks) {
      model.networks = Object.fromEntries(
        Object.entries(source.model.networks).filter(([id]) => usedNetworks.has(id)),
      )
    }
    if (source.model.volumes) {
      model.volumes = Object.fromEntries(
        Object.entries(source.model.volumes).filter(([id]) => usedVolumes.has(id)),
      )
    }
    const yaml = stringify(model)
    if (/(?<!\$)\$\{/.test(yaml)) {
      throw new Error("Unresolved Compose interpolation in active inputs")
    }
    const file = join(dirname(source.file), `.redpact-selected-${index}.yaml`)
    await mkdir(dirname(join(stage, file)), { recursive: true })
    await writeFile(join(stage, file), yaml, { flag: "wx", mode: 0o600 })
    files.push(file)
  }
  const override: { services: Record<string, unknown> } = { services: {} }
  let index = 0
  for (const id of plan.activeServices) {
    const environment: Record<string, string | null> = {}
    for (const [key, binding] of Object.entries(plan.bindings[id])) {
      if ("unset" in binding) {
        environment[key] = null
      } else if ("value" in binding) {
        environment[key] = binding.value.replaceAll("$", "$$")
      } else {
        const value = secrets[binding.secret]
        if (value === undefined) {
          throw new Error(`Missing secret reference: ${binding.secret}`)
        }
        const variable = `REDPACT_BIND_${index++}`
        variables[variable] = value
        environment[key] = `\${${variable}}`
        if (value) {
          redactions.push(value)
        }
      }
    }
    override.services[id] = { environment, depends_on: plan.prerequisites[id] }
  }
  const file = ".redpact-bindings.yaml"
  await writeFile(join(stage, file), stringify(override), { flag: "wx", mode: 0o600 })
  files.push(file)
  return { files, variables, redactions }
}
