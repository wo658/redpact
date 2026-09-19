import type { UnitCatalog } from "./unit-tests.js"

export type IntegrationTestsService = {
  inspect(
    worktreeId: string,
    scope?: "changed" | "all",
  ): Promise<{ directory: string; catalog: UnitCatalog }>
}
