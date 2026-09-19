import { problem } from "../core/problems.js"
import type { CaptureService, CaptureStore } from "../core/types/playwright.js"
export function createCaptures(store: CaptureStore): CaptureService {
  const get = (id: string) =>
    store.list().find((run) => run.id === id) ?? problem("not_found", "Playwright run not found")
  return {
    source: (id, path) => store.source(get(id), path),
    all: () => store.list(),
    get,
    list: (id) =>
      store
        .list()
        .filter((run) => run.worktreeId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    listProject: (id) =>
      store
        .list()
        .filter((run) => run.projectId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    save: (run) => store.save(run),
    artifact: (id, side, artifact) => store.artifact(get(id), side, artifact),
  }
}
