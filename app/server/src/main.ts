import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { PassThrough } from "node:stream"
import { serve } from "@hono/node-server"
import { Command, Option } from "commander"
import envPaths from "env-paths"
import pino from "pino"
import { observeProjectFiles } from "./adapters/changes/projects.js"
import { createChangeWatcher } from "./adapters/changes/watch.js"
import { createNativeDirectoryPicker } from "./adapters/desktop/directory-picker.js"
import { createComposeAdapter } from "./adapters/environment/testcontainers.js"
import { createUnitContainer } from "./adapters/environment/unit-container.js"
import { readCommitDiff } from "./adapters/git/commit-diff.js"
import { discoverCheckouts } from "./adapters/git/discover.js"
import { fetchRemotes } from "./adapters/git/fetch.js"
import { readHistory } from "./adapters/git/history.js"
import { readCommittedImage } from "./adapters/git/image.js"
import { createGitAdapter } from "./adapters/git/isomorphic.js"
import { createGitMutations } from "./adapters/git/mutations.js"
import { createWorktreeAdapter } from "./adapters/git/worktrees.js"
import { createGitHubPullRequests } from "./adapters/github/pull-requests.js"
import { parseSource } from "./adapters/parser/source.js"
import { createCaptureBaselineCleanup } from "./adapters/playwright/baseline.js"
import { discoverPlaywright } from "./adapters/playwright/catalog.js"
import { createCaptureRunner } from "./adapters/playwright/runner.js"
import { createScheduler } from "./adapters/process/queue.js"
import { readProjectEntry } from "./adapters/project-files.js"
import { readProjectFile } from "./adapters/settings/bundle.js"
import { createSettingsFiles } from "./adapters/settings/editor-files.js"
import { initializeSettings } from "./adapters/settings/initialize.js"
import { createSettingsService, readJsonSettings } from "./adapters/settings/json.js"
import { preferenceFiles } from "./adapters/settings/preferences.js"
import { createLocalFiles } from "./adapters/sources/local.js"
import { catalogPaths, createUnitTestFiles } from "./adapters/sources/unit-tests.js"
import { createCaptureStore } from "./adapters/storage/captures.js"
import { openStore } from "./adapters/storage/files.js"
import { loadInstance } from "./adapters/storage/instance.js"
import { createMergeStore } from "./adapters/storage/merges.js"
import { createProjectSecretStore } from "./adapters/storage/project-secrets.js"
import { createReviewStore } from "./adapters/storage/reviews.js"
import { createRunLogReader } from "./adapters/storage/run-logs.js"
import { createUnitRunStore } from "./adapters/storage/unit-runs.js"
import { createVitestRunner } from "./adapters/test-runner/vitest.js"
import { readRegistryTags, runtimePackage } from "./adapters/updates/registry.js"
import { createApp } from "./app.js"
import { instanceSettingsSchema, serverPortSchema } from "./core/instance-schema.js"
import { testSelectionSchema } from "./core/settings-schema.js"
import { testResourceSchema } from "./core/test-resource-schema.js"
import type { CaptureWorkflow } from "./core/types/playwright.js"
import { createDesktopControl } from "./interfaces/desktop/control.js"
import { createCaptureWorkflow } from "./workflows/capture-ui.js"
import { createDirectoryPicker } from "./workflows/directory-picker.js"
import { createEnvironments } from "./workflows/environments.js"
import { createExecuteTests } from "./workflows/execute-tests.js"
import { createGitService } from "./workflows/git.js"
import { createIntegrationTests } from "./workflows/integration-tests.js"
import { createMergeService } from "./workflows/merge.js"
import { createObserveProjects } from "./workflows/observe-projects.js"
import { createCaptures } from "./workflows/playwright.js"
import { createPlaywrightCatalog } from "./workflows/playwright-catalog.js"
import { createProjectFiles } from "./workflows/project-files.js"
import { createProjectGraph } from "./workflows/project-graph.js"
import { createProjectSecrets } from "./workflows/project-secrets.js"
import { createProjectSettings } from "./workflows/project-settings.js"
import { createPullRequests } from "./workflows/pull-requests.js"
import { createReviewContent } from "./workflows/review-content.js"
import { createReviewTests } from "./workflows/review-tests.js"
import {
  createCollectTests,
  createRunFiles,
  createRunWorktreeTests,
} from "./workflows/run-files.js"
import { createRunQueries } from "./workflows/run-queries.js"
import { createRuns } from "./workflows/runs.js"
import { createSettingsEditor } from "./workflows/settings-editor.js"
import { createWorkStarts } from "./workflows/start-work.js"
import { createStopEnvironment } from "./workflows/stop-environment.js"
import { createSubmissions } from "./workflows/submissions.js"
import { createTestContainer } from "./workflows/test-container.js"
import { createUnitTests } from "./workflows/unit-tests.js"
import { createUpdates } from "./workflows/updates.js"
import { createWorktrees } from "./workflows/worktrees.js"

const desktopMode = process.env.REDPACT_DESKTOP_CONTROL === "1"
delete process.env.REDPACT_DESKTOP_CONTROL
const runtimeSupervised =
  process.env.REDPACT_RUNTIME_SUPERVISED === "1" && Boolean(process.send) && !desktopMode
const updateError = process.env.REDPACT_UPDATE_ERROR
delete process.env.REDPACT_RUNTIME_SUPERVISED
delete process.env.REDPACT_UPDATE_ERROR

const command = new Command()
  .name("redpact-server")
  .description("Local Redpact submission and test runner server")
  .option("--data-dir <path>", "Local state directory", envPaths("redpact").data)
  .option("--project <path>", "Optional default project; omit for explicit worktree routing")
  .option("--port <number>", "Override settings.json loopback port (default: 54318)")
  .addOption(
    new Option(
      "--host <address>",
      "Listen address; use 0.0.0.0 inside a container with loopback-only published ports",
    )
      .choices(["127.0.0.1", "0.0.0.0"])
      .default("127.0.0.1"),
  )
  .action(async (options) => {
    if (desktopMode && options.host !== "127.0.0.1") {
      throw new Error("Desktop control requires a loopback listen address")
    }
    const override = options.port === undefined ? undefined : Number(options.port)
    if (override !== undefined && !serverPortSchema.safeParse(override).success) {
      throw new Error("Invalid port")
    }

    const directory = resolve(options.dataDir)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const storage = openStore(directory)
    try {
      const { instance, settings: instanceSettings } = loadInstance(directory)
      const port = override ?? instanceSettings.server.port
      const logger = pino({
        level: "info",
        redact: ["token", "authorization"],
      })
      const readTestResources = async () => {
        const document = await settingsEditor.instance()
        if (document.issues.length) {
          throw new Error(`Invalid instance settings: ${document.issues.join("; ")}`)
        }
        return testResourceSchema.parse(document.value?.testResources ?? {})
      }
      const readEnvironmentConcurrency = async () => {
        const document = await settingsEditor.instance()
        if (document.issues.length) {
          throw new Error(`Invalid instance settings: ${document.issues.join("; ")}`)
        }
        return instanceSettingsSchema.parse(document.value ?? {}).environmentConcurrency ?? 2
      }
      const runner = createVitestRunner(directory, readTestResources)
      const gitAdapter = createGitAdapter()
      const projectSettings = createProjectSettings({
        store: storage.store,
        git: gitAdapter,
        preferences: preferenceFiles,
      })
      const worktrees = createWorktrees({
        initializeSettings,
        projects: projectSettings,
        preferences: preferenceFiles,
        store: storage.store,
        git: gitAdapter,
        gitService: (path) => createGitService(path, gitAdapter),
        settings: createSettingsService,
      })
      const workStarts = createWorkStarts({
        store: storage.store,
        git: createWorktreeAdapter(),
        worktrees,
      })
      const project = options.project ? await worktrees.connect(options.project) : undefined
      const worktree = project ? await worktrees.ensure(project.id, options.project) : undefined
      const defaultWorktreeId = worktree?.id
      const settings = worktree
        ? (await worktrees.resolve(worktree.id)).settings
        : createSettingsService(process.cwd())
      const git = createGitService(settings.projectRoot, gitAdapter)
      const projectSecrets = createProjectSecrets({
        store: createProjectSecretStore(directory),
        worktrees,
      })
      const composeAdapter = createComposeAdapter(directory, projectSecrets.resolve)
      const environments = createEnvironments({
        secrets: projectSecrets.resolve,
        store: storage.store,
        worktrees,
        adapter: composeAdapter,
        ownerId: instance.id,
      })
      const runCore = createRuns({ store: storage.store, runner })
      const captures = createCaptures(createCaptureStore(directory))
      const unitStore = createUnitRunStore(directory)
      const runs = createRunQueries(storage.store, createRunLogReader(directory), {
        units: () => unitStore.list(),
        captures: () => captures.all(),
      })
      let captureWorkflow: CaptureWorkflow | undefined
      const stopEnvironment = createStopEnvironment({
        environments,
        runs: runCore,
        cancelCapture: async (id) => {
          if (!captureWorkflow || !captures.all().some((run) => run.id === id)) {
            return false
          }
          await captureWorkflow.cancel(id)
          return true
        },
      })
      const testContainer = createTestContainer({
        readFile: readProjectEntry,
        worktrees,
        projects: projectSettings,
        environments,
        stopEnvironment,
        fingerprint: composeAdapter.fingerprint,
      })
      const executeTests = createExecuteTests({
        runs: runCore,
        stopEnvironment,
        environments,
        worktrees,
        defaultWorktreeId,
        git,
        scheduler: createScheduler((key) => (key === "local" ? readEnvironmentConcurrency() : 1)),
        settings,
      })
      await environments.recover()
      captureWorkflow = createCaptureWorkflow({
        captures,
        runner: createCaptureRunner(
          directory,
          instance.id,
          (record) => Object.values(projectSecrets.resolve(record)),
          readTestResources,
        ),
        baseline: createCaptureBaselineCleanup(directory),
        worktrees,
        environments,
        stopEnvironment,
      })
      await captureWorkflow.recover()
      await stopEnvironment.cleanupTemporary()
      const submissions = createSubmissions({
        worktrees,
        defaultWorktreeId,
        store: storage.store,
        parse: parseSource,
        runnerVersion: runner.version,
        projectRoot: settings.projectRoot,
      })
      const localFiles = createLocalFiles(worktrees.settingsForPath)
      const runFiles = createRunFiles({ files: localFiles, worktrees, submissions, executeTests })
      const collect = createCollectTests({
        files: localFiles,
        worktrees,
        submissions,
        executeTests,
      })
      const reviews = createReviewTests({
        store: createReviewStore(directory),
        collect: async (input) => {
          const selection = testSelectionSchema.optional().parse(input.selection)
          const result = await collect({ ...input, selection })
          return { ...result, selection: testSelectionSchema.parse(result.selection) }
        },
        settings: (path) => localFiles.settings(path),
        submissions,
        execute: executeTests,
        runs,
      })
      const observation = {
        settingsPath: join(directory, "settings.json"),
        issues: [] as { path: string; message: string }[],
      }
      const projectObserver = await observeProjectFiles({
        waitForInitial: false,
        settingsPath: observation.settingsPath,
        defaults: options.project ? [resolve(options.project)] : [],
        observe: createObserveProjects({
          files: localFiles,
          worktrees,
          submissions,
          checkouts: discoverCheckouts,
        }),
        report: (issues) => {
          observation.issues = issues
          if (issues.length) {
            logger.warn({ issues }, "Project observation needs attention")
          }
        },
      })
      const changes = createChangeWatcher()
      const settingsEditor = createSettingsEditor({
        projects: projectSettings,
        directory,
        files: createSettingsFiles(),
        validateProject: (root, source) =>
          readJsonSettings(root, undefined, { file: join(root, ".redpact/settings.json"), source }),
      })
      const unitTests = createUnitTests({
        worktrees,
        projects: projectSettings,
        settings: settingsEditor,
        files: createUnitTestFiles(),
        command: createUnitContainer(directory, instance.id, readTestResources),
        store: unitStore,
      })
      const pullRequests = createPullRequests({
        worktrees,
        git: createGitMutations(),
        github: createGitHubPullRequests(undefined, async () => {
          const document = await settingsEditor.instance()
          if (document.issues.length) {
            throw Object.assign(new Error("Fix global settings before using GitHub"), {
              code: "invalid_input",
            })
          }
          return (document.value?.github as { cliPath?: string } | undefined)?.cliPath
        }),
      })
      const merges = createMergeService({
        worktrees,
        projects: projectSettings,
        git: createGitMutations(),
        store: createMergeStore(directory),
        directory,
      })
      const directoryPicker = createDirectoryPicker(createNativeDirectoryPicker())
      const installed = await runtimePackage()
      const updates = createUpdates({
        currentVersion: installed.version,
        supported: !desktopMode && installed.name === "redpact",
        installError: updateError,
        requestInstall: runtimeSupervised
          ? (version) =>
              new Promise<void>((resolve, reject) => {
                if (!process.send || !process.connected) {
                  reject(new Error("CLI supervisor disconnected"))
                  return
                }
                process.send({ runtimeUpdate: version }, (error) => {
                  if (error) {
                    reject(error)
                  } else {
                    resolve()
                  }
                })
              })
          : undefined,
        readTags: readRegistryTags,
        now: () => new Date().toISOString(),
      })
      const app = createApp({
        updates,
        reviewContent: createReviewContent({
          worktrees,
          projects: projectSettings,
          settings: settingsEditor,
          changedPaths: (root, base) => catalogPaths(root, base, "changed"),
          discover: discoverPlaywright,
          captures: (id) => captures.list(id),
          unitExists: (id) => unitStore.list().some((run) => run.worktreeId === id),
          integrationActive: (id) =>
            storage.store
              .listRuns()
              .some(
                (run) =>
                  run.state !== "finished" &&
                  storage.store.getSubmission(run.submissionId)?.worktreeId === id,
              ),
          logExists: (id) => runs.listForWorktree(id).items.length > 0,
          environmentExists: (id) => environments.list(id).length > 0,
        }),
        captures,
        captureWorkflow,
        playwrightCatalog: createPlaywrightCatalog({
          projects: projectSettings,
          worktrees,
          discover: discoverPlaywright,
          changedPaths: (root, base) => catalogPaths(root, base, "changed"),
          read: readProjectFile,
        }),
        merges,
        pullRequests,
        directoryPicker,
        integrationTests: createIntegrationTests({
          worktrees,
          projects: projectSettings,
          settings: settingsEditor,
          files: createUnitTestFiles(),
        }),
        unitTests,
        settingsEditor,
        projectSettings,
        testContainer,
        projectFiles: createProjectFiles({ projects: projectSettings, read: readProjectEntry }),
        projectGraph: createProjectGraph({
          image: readCommittedImage,
          fetch: fetchRemotes,
          store: storage.store,
          read: readHistory,
          diff: readCommitDiff,
        }),
        reviews,
        observation,
        localFiles,
        runFiles,
        runWorktreeTests: createRunWorktreeTests({
          files: localFiles,
          worktrees,
          submissions,
          executeTests,
        }),
        changes,
        dataDirectory: directory,
        projectSecrets,
        runs,
        executeTests,
        stopEnvironment,
        submissions,
        settings,
        git,
        worktrees,
        workStarts,
        defaultWorktreeId,
        environments,
      })

      const runtimeInput = runtimeSupervised ? new PassThrough() : undefined
      if (runtimeInput) {
        process.on("message", (message: unknown) => {
          if (!message || typeof message !== "object") {
            return
          }
          if (
            "runtimeControl" in message &&
            (message.runtimeControl === "update" || message.runtimeControl === "shutdown")
          ) {
            runtimeInput.write(`${message.runtimeControl}\n`)
          }
          if ("runtimeUpdateError" in message && typeof message.runtimeUpdateError === "string") {
            updates.installationFailed(message.runtimeUpdateError)
          }
        })
        process.once("disconnect", () => runtimeInput.end())
      }
      const desktop =
        desktopMode || runtimeSupervised
          ? createDesktopControl({
              input: runtimeInput ?? process.stdin,
              busy: () =>
                captures.all().some((run) => run.state !== "finished") ||
                merges.busy() ||
                pullRequests.busy() ||
                storage.store.listRuns().some((run) => run.state !== "finished") ||
                storage.store
                  .listEnvironments()
                  .some((environment) =>
                    ["preparing", "in_use", "stopping"].includes(environment.state),
                  ) ||
                unitStore.list().some((run) => run.state === "running"),
              stop: () => stop(),
              send: (message) => {
                if (runtimeSupervised) {
                  if (process.connected) {
                    process.send?.({ runtimeControl: message.desktop }, () => {
                      if (message.desktop === "stopped" && process.connected) {
                        process.disconnect()
                      }
                    })
                  }
                } else {
                  process.stdout.write(`${JSON.stringify(message)}\n`)
                }
              },
            })
          : undefined
      const server = serve(
        {
          fetch: (request, env) =>
            desktop ? desktop.fetch(() => app.fetch(request, env)) : app.fetch(request, env),
          hostname: options.host,
          port,
        },
        (address) => {
          logger.info(
            { host: options.host, port: address.port },
            options.host === "127.0.0.1"
              ? "Redpact listening on loopback"
              : "Redpact listening in container mode",
          )
          if (runtimeSupervised) {
            process.send?.({ runtimeReady: address.port })
          }
          if (desktopMode) {
            process.stdout.write(`${JSON.stringify({ desktop: "ready", port: address.port })}\n`)
          }
        },
      )
      updates.start()
      let stopping = false
      const stop = async () => {
        if (stopping) {
          return
        }
        stopping = true
        updates.close()
        await directoryPicker.close()
        desktop?.close()
        await projectObserver.close()
        await changes.close()
        server.close()
        await pullRequests.close()
        await merges.close()
        await unitTests.close()
        await reviews.close()
        await captureWorkflow?.close()
        await testContainer.close()
        await executeTests.close()
        await environments.close()
        storage.close()
        if (desktop && "closeAllConnections" in server) {
          server.closeAllConnections()
        }
      }
      process.once("SIGINT", () => {
        void stop()
      })
      process.once("SIGTERM", () => {
        void stop()
      })
      server.once("error", (error) => {
        logger.error(error)
        void stop()
        process.exitCode = 1
      })
    } catch (error) {
      storage.close()
      throw error
    }
  })
await command.parseAsync()
