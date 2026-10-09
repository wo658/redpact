import { z } from "zod"
import type { localRuntime } from "./local.js"

const project = z.object({ id: z.string(), name: z.string() })
const worktree = z.object({
  id: z.string(),
  branch: z.string().nullable().optional(),
  projectRoot: z.string(),
})
const run = z.object({
  id: z.string(),
  state: z.string(),
  createdAt: z.string(),
  kind: z.string().optional(),
  intent: z.string().optional(),
  outcome: z.string().nullable().optional(),
})
const environment = z.object({ id: z.string(), state: z.string(), lifecycle: z.string() })
export async function readPage(
  runtime: ReturnType<typeof localRuntime>,
  selected: { projectId?: string; worktreeId?: string } = {},
) {
  const status = await runtime.status()
  const page = {
    status,
    projects: [] as z.infer<typeof project>[],
    worktrees: [] as z.infer<typeof worktree>[],
    runs: [] as z.infer<typeof run>[],
    environments: [] as z.infer<typeof environment>[],
    projectId: "",
    worktreeId: "",
    error: "",
  }
  if (status.state !== "running") {
    return page
  }
  try {
    page.projects = z.array(project).parse(await runtime.request("/api/projects"))
    page.projectId =
      page.projects.find((item) => item.id === selected.projectId)?.id ?? page.projects[0]?.id ?? ""
    if (!page.projectId) {
      return page
    }
    page.worktrees = z
      .array(worktree)
      .parse(await runtime.request(`/api/projects/${encodeURIComponent(page.projectId)}/worktrees`))
    page.worktreeId =
      page.worktrees.find((item) => item.id === selected.worktreeId)?.id ??
      page.worktrees[0]?.id ??
      ""
    if (!page.worktreeId) {
      return page
    }
    const query = new URLSearchParams({ worktreeId: page.worktreeId })
    const [runs, environments] = await Promise.all([
      runtime.request(`/api/runs?${query}`),
      runtime.request(`/api/environments?${query}`),
    ])
    page.runs = z.object({ items: z.array(run) }).parse(runs).items
    page.environments = z.array(environment).parse(environments)
  } catch (failure) {
    page.error = failure instanceof Error ? failure.message : String(failure)
  }
  return page
}
export type Page = Awaited<ReturnType<typeof readPage>>
