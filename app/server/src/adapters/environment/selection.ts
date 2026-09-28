import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { isAlias, isNode, parseDocument, stringify } from "yaml"
import type { Environment } from "../../core/types/environment.js"
import { readComposeModel } from "../settings/bundle.js"

export async function stageSelection(
  stage: string,
  record: Pick<Environment, "plan" | "settings">,
  sourceRoot = stage,
) {
  const plan = record.plan
  if (!plan) {
    throw new Error("Missing environment plan")
  }
  const { sources } = await readComposeModel(sourceRoot, record.settings.environment.compose.files)
  const active = new Set(plan.activeServices)
  const files: string[] = []
  for (const [index, source] of sources.entries()) {
    const document = parseDocument(source.source)
    // Materialize service aliases before editing bindings on their shared anchor.
    for (const id of Object.keys(source.model.services ?? {})) {
      const path = ["services", id]
      const node = document.getIn(path, true)
      if (isAlias(node)) {
        document.setIn(path, node.resolve(document)?.clone())
      }
    }
    for (const id of Object.keys(source.model.services ?? {})) {
      if (!active.has(id)) {
        document.deleteIn(["services", id])
        continue
      }
      const environment = source.model.services[id].environment
      if (environment && Object.keys(plan.bindings[id] ?? {}).length) {
        const values = { ...(environment as Record<string, string | number | null>) }
        for (const key of Object.keys(plan.bindings[id] ?? {})) {
          delete values[key]
        }
        const path = ["services", id, "environment"]
        const original = document.getIn(path, true)
        const replacement = document.createNode(values)
        if (isNode(original)) {
          replacement.tag = original.tag
        }
        document.setIn(path, replacement)
      }
    }
    const yaml = document.toString()
    const file = join(dirname(source.file), `.redpact-selected-${index}.yaml`)
    await mkdir(dirname(join(stage, file)), { recursive: true })
    await writeFile(join(stage, file), yaml, { flag: "wx", mode: 0o600 })
    files.push(file)
  }
  const override: { services: Record<string, unknown> } = { services: {} }
  for (const id of plan.activeServices) {
    const environment: Record<string, string | null> = {}
    for (const [key, binding] of Object.entries(plan.bindings[id])) {
      environment[key] = typeof binding === "string" ? binding.replaceAll("$", "$$") : null
    }
    override.services[id] = { environment }
  }
  const file = ".redpact-bindings.yaml"
  await writeFile(join(stage, file), stringify(override), { flag: "wx", mode: 0o600 })
  files.push(file)
  return { files }
}
