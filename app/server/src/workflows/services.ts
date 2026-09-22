import type { ChangeWatcher } from "../core/types/changes.js"
import type { Run } from "../core/types/contracts.js"
import type { DirectoryPicker } from "../core/types/directory-picker.js"
import type { GitService } from "../core/types/git.js"
import type { ProjectGraph } from "../core/types/git-graph.js"
import type { IntegrationTestsService } from "../core/types/integration-tests.js"
import type { LocalFiles } from "../core/types/local-files.js"
import type { MergeService } from "../core/types/merge.js"
import type {
  CaptureService,
  CaptureWorkflow,
  PlaywrightCatalog,
} from "../core/types/playwright.js"
import type { ProjectFiles } from "../core/types/project-files.js"
import type { ProjectSecrets } from "../core/types/project-secrets.js"
import type { PullRequestService } from "../core/types/pull-requests.js"
import type { ReviewContentService } from "../core/types/review-content.js"
import type { ReviewTests } from "../core/types/reviews.js"
import type {
  EnvironmentService,
  ExecuteTests,
  ProjectSettingsService,
  RunQueries,
  StopEnvironment,
  SubmissionsService,
  WorkStarts,
  WorktreeService,
} from "../core/types/services.js"
import type { SettingsService, TestSelection } from "../core/types/settings.js"
import type { SettingsEditor } from "../core/types/settings-editor.js"
import type { TestContainer } from "../core/types/test-container.js"
import type { UnitTestsService } from "../core/types/unit-tests.js"
import type { Updates } from "../core/types/updates.js"

export type Services = {
  updates?: Updates
  reviewContent?: ReviewContentService
  testContainer?: TestContainer
  projectFiles?: ProjectFiles
  projectSecrets?: ProjectSecrets
  pullRequests?: PullRequestService
  playwrightCatalog?: PlaywrightCatalog
  captures?: CaptureService
  captureWorkflow?: CaptureWorkflow
  projectGraph?: ProjectGraph
  merges?: MergeService
  directoryPicker?: DirectoryPicker
  integrationTests?: IntegrationTestsService
  unitTests?: UnitTestsService
  settingsEditor?: SettingsEditor
  projectSettings?: ProjectSettingsService
  reviews?: ReviewTests
  observation?: { settingsPath: string; issues: { path: string; message: string }[] }
  localFiles?: LocalFiles
  runWorktreeTests?: (worktreeId: string) => Promise<Run>
  runFiles?: (input: { path: string; tests?: string[]; selection?: TestSelection }) => Promise<Run>
  changes?: ChangeWatcher
  dataDirectory?: string
  environments?: EnvironmentService
  defaultWorktreeId?: string
  worktrees?: WorktreeService
  workStarts?: WorkStarts
  git?: GitService
  settings: SettingsService
  submissions: SubmissionsService
  runs: RunQueries
  executeTests: ExecuteTests
  stopEnvironment?: StopEnvironment
}
