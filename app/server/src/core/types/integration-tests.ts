import type { TestSource, UnitCatalog } from "./unit-tests.js"

export type IntegrationTestsService = {
  source(worktreeId: string, path: string): Promise<TestSource>
  inspect(
    worktreeId: string,
    scope?: "changed" | "all",
  ): Promise<{ directory: string; catalog: UnitCatalog }>
}
