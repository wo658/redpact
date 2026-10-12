import { randomUUID } from "node:crypto"
import { createLocalFiles } from "../../src/adapters/sources/local.js"
import { createApp } from "../../src/app.js"
import type { Store, TestRunner } from "../../src/core/types/contracts.js"
import type { TestSelection } from "../../src/core/types/settings.js"
import { createEnvironments } from "../../src/workflows/environments.js"
import { createExecuteTests } from "../../src/workflows/execute-tests.js"
import { createRunFiles } from "../../src/workflows/run-files.js"
import { createRunQueries } from "../../src/workflows/run-queries.js"
import { createRuns } from "../../src/workflows/runs.js"
import type { Services } from "../../src/workflows/services.js"
import { createStopEnvironment } from "../../src/workflows/stop-environment.js"
import type { createTestWorktrees } from "./worktrees.js"

export function createTestExecution(
  deps: Omit<Parameters<typeof createExecuteTests>[0], "runs" | "stopEnvironment"> & {
    runner: TestRunner
    store: Store
  },
) {
  const testEnvironments =
    !deps.environments && deps.worktrees
      ? createEnvironments({
          store: deps.store,
          worktrees: deps.worktrees,
          ownerId: randomUUID(),
          adapter: {
            fingerprint: async () => "runner-fixture",
            prepare: async () => {},
            inspect: async () => ({
              runtimeId: "fixture",
              resources: [],
              endpoints: {},
              healthy: true,
            }),
            stop: async () => {},
          },
        })
      : undefined
  const environments = deps.environments ?? testEnvironments
  const core = createRuns({ store: deps.store, runner: deps.runner })
  const stopEnvironment = environments
    ? createStopEnvironment({ environments, runs: core })
    : Object.assign(
        async (_id: string): Promise<never> => {
          throw new Error("Environment service is not connected")
        },
        { idle: async () => {}, cleanupTemporary: async () => {} },
      )
  const execution = createExecuteTests({ ...deps, environments, runs: core, stopEnvironment })
  const queries = createRunQueries(deps.store)
  return {
    ...execution,
    ...queries,
    core,
    stopEnvironment,
    async start(submissionId: string, selection?: TestSelection, expectedSettingsDigest?: string) {
      if (testEnvironments && !selection) {
        selection = { services: ["app"], select: {} }
      }
      return execution.start(submissionId, selection, expectedSettingsDigest)
    },
    async close() {
      await execution.close()
      await testEnvironments?.close()
    },
  }
}
export type TestServices = Omit<
  Services,
  "runs" | "executeTests" | "stopEnvironment" | "worktrees"
> & {
  worktrees?: ReturnType<typeof createTestWorktrees>
  runs: ReturnType<typeof createTestExecution>
}
export function createTestApp(services: TestServices) {
  const localFiles = createLocalFiles(services.worktrees?.settingsForPath)
  return createApp({
    ...services,
    projectSettings: services.projectSettings ?? services.worktrees?.projects,
    localFiles,
    runFiles: services.worktrees
      ? createRunFiles({
          files: localFiles,
          worktrees: services.worktrees,
          submissions: services.submissions,
          executeTests: services.runs,
        })
      : undefined,
    workStarts: services.worktrees?.workStarts,
    executeTests: services.runs,
    stopEnvironment: services.runs.stopEnvironment,
  })
}
