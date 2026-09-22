import { randomBytes } from "node:crypto"
import { problem } from "../core/problems.js"
import { variableName } from "../core/settings-values.js"
import type { ProjectSecretStore, ProjectSecrets } from "../core/types/project-secrets.js"
import type { WorktreeService } from "../core/types/services.js"

export function createProjectSecrets(deps: {
  store: ProjectSecretStore
  worktrees: Pick<WorktreeService, "projectSettings">
  fallback?: NodeJS.ProcessEnv
}): ProjectSecrets {
  const requests = new Map<string, { projectId: string; names: Set<string>; expires: number }>()
  const fallback = deps.fallback ?? process.env
  async function names(projectId: string) {
    const result = await (await deps.worktrees.projectSettings(projectId)).read()
    if (!result.valid || !result.settings) {
      problem("invalid_input", "Repair project settings before editing secrets")
    }
    const bindings = Object.values(result.settings.dependencies).flatMap((dependency) =>
      Object.values(dependency.env).flatMap(Object.values),
    )
    return [
      ...new Set(
        [...bindings, ...Object.values(result.settings.tests.env)].flatMap((value) =>
          typeof value !== "string" && "secret" in value ? [value.secret] : [],
        ),
      ),
    ].sort()
  }
  const service: ProjectSecrets = {
    async value(projectId, name) {
      if (!(await names(projectId)).includes(name)) {
        problem("not_found", "Secret is not declared in project settings")
      }
      return { value: deps.store.project(projectId)[name] ?? fallback[name] ?? "" }
    },
    async request(projectId, requested) {
      const declared = await service.list(projectId)
      if (
        !requested.length ||
        requested.some((name) => !declared.some((item) => item.name === name))
      ) {
        problem("invalid_input", "Request only declared credential names")
      }
      for (const [token, request] of requests) {
        if (request.expires <= Date.now()) {
          requests.delete(token)
        }
      }
      if (requests.size >= 100) {
        problem("invalid_input", "Too many pending key requests")
      }
      const token = randomBytes(32).toString("hex")
      requests.set(token, {
        projectId,
        names: new Set(requested),
        expires: Date.now() + 30 * 60 * 1000,
      })
      return { token, inputs: declared.filter((item) => requested.includes(item.name)) }
    },
    async submit(token, name, value) {
      const request = requests.get(token)
      if (!request || request.expires <= Date.now() || !request.names.has(name)) {
        problem("invalid_input", "Key request is unavailable; request the inputs again")
      }
      return service.set(request.projectId, name, value)
    },
    async list(projectId) {
      const declared = await names(projectId)
      const values = deps.store.project(projectId)
      return declared.map((name) => ({ name, configured: Boolean(values[name] ?? fallback[name]) }))
    },
    async set(projectId, name, value) {
      if (
        !variableName.safeParse(name).success ||
        typeof value !== "string" ||
        value.length > 10000 ||
        value.includes("\0")
      ) {
        problem("invalid_input", "Invalid secret name or value")
      }
      if (!(await names(projectId)).includes(name)) {
        problem("not_found", "Secret is not declared in project settings")
      }
      deps.store.saveProject(projectId, { ...deps.store.project(projectId), [name]: value })
      return { name, configured: Boolean(value) }
    },
    resolve(record) {
      const captured = deps.store.environment(record.id)
      if (captured) {
        return captured
      }
      const project = deps.store.project(record.target.projectId)
      const values: Record<string, string> = {}
      for (const name of record.plan.requiredSecrets) {
        const value = project[name] ?? fallback[name]
        if (!value) {
          problem("environment_error", `Enter required secret ${name} in Project dependencies`)
        }
        values[name] = value
      }
      deps.store.saveEnvironment(record.id, values)
      return values
    },
  }
  return service
}
