import { z } from "zod"
import { dependencyOverridePath, dependencyOverrideSchema } from "./dependency-overrides.js"
import { settingsSchema, testSelectionSchema } from "./settings-schema.js"
import { trackingSchema } from "./tracking-schema.js"
import type { SettingsResult } from "./types/settings.js"
export const settingsExample = JSON.stringify(
  {
    composeFiles: ["compose.yaml"],
    applicationServices: { web: { services: ["app"], description: "Application under review" } },
    dependencies: {
      payments: {
        modes: {
          isolated: {
            services: ["payments"],
            env: { app: { PAYMENTS_URL: "http://payments:8080" } },
          },
          "shared-local": { env: { app: { PAYMENTS_URL: "http://host.docker.internal:8080" } } },
          mock: { env: { app: { PAYMENTS_MODE: "mock" } } },
          remote: {
            env: {
              app: {
                PAYMENTS_URL: "https://payments.example.com",
                PAYMENTS_KEY: { secret: "PAYMENTS_KEY" },
              },
            },
          },
        },
        recommendation: {
          mode: "mock",
          reason: "Use the implemented mock for deterministic local review",
        },
      },
    },
    relationships: [
      {
        from: "web",
        to: { kind: "dependency", name: "payments" },
        description: "Process checkout payments",
        evidence: [{ path: "src/payments.ts", line: 1 }],
      },
    ],
    tests: {
      directory: "integration",
      env: { APP_URL: { service: "app", port: 3000, scheme: "http" } },
    },
  },
  null,
  2,
)
export function describeSettings() {
  return {
    path: ".redpact/settings.json",
    format: "json",
    schema: z.toJSONSchema(settingsSchema, { io: "input" }),
    selectionSchema: z.toJSONSchema(testSelectionSchema, { io: "input" }),
    example: settingsExample,
    dependencyOverrides: {
      path: dependencyOverridePath,
      root: "projectRoot (linked worktrees only)",
      schema: z.toJSONSchema(dependencyOverrideSchema, { io: "input" }),
      merge:
        "Replace each named dependency or application as a whole; inherit unnamed entries. composeFiles and relationships replace whole lists. testEnv replaces named bindings; omitted bindings are inherited. No deletion markers or arbitrary settings overrides.",
      promotion:
        "configure inspect returns promotion.source and baseSha256/overrideSha256 for a valid WT override. At approved merge, re-inspect against current shared settings, review the candidate, and save it through the project configuration API with its current revision. Include changed Compose/mock sources in the merge and remove the WT override only after successful promotion and verification. Never silently promote at execution or approval of a test run.",
    },
    preferenceFiles: {
      integrationDefaults: {
        path: ".redpact/integration-defaults.json",
        root: "rulesRoot",
        schema: z.toJSONSchema(testSelectionSchema),
      },
      tracking: {
        path: ".redpact/tracking.json",
        root: "rulesRoot",
        schema: z.toJSONSchema(trackingSchema),
      },
      selection: {
        path: ".redpact/selection.json",
        root: "projectRoot",
        schema: z.toJSONSchema(testSelectionSchema),
      },
    },
    selectionExample: { services: ["app"], select: { payments: "mock" } },
    playwright: {
      workflow:
        "Configure optional playwright with directory/service/port and required targets in this same settings file. Each target declares scope (worktree or project; default project), purpose (capture or functional) and relative testMatch globs; files must not match multiple targets. Keep files below the configured directory in worktree/captures, worktree/tests, project/captures and project/tests. Ignore the worktree subtree in Git. Author ordinary @playwright/test files for actual application flows. Capture targets supply named component PNG attachments; functional targets supply assertions and diagnostic run attachments. Redpact supplies Docker Chromium, trace and optional video; there is no storyboard renderer or project Playwright config execution.",
      inspect: "GET /api/worktrees/:id/playwright",
      execute:
        "POST /api/worktrees/:id/playwright/run with {target, selection?, viewport?}; target may be omitted only when one target exists; requires actual managed Compose application services. Viewing does not execute.",
      result:
        "GET /api/playwright-runs/:id; retained artifacts and exact captured scenario sources remain available after cleanup.",
      cancel: "POST /api/playwright-runs/:id/cancel cancels execution or retries cleanup.",
      cleanupWorktree:
        "POST /api/worktrees/:id/playwright/cleanup-worktree removes worktree drafts only when they match the latest recorded worktree source bundle. Unrecorded or edited drafts are preserved; execution source and artifacts remain in history.",
      execution:
        "All targets execute only the selected worktree. No baseline application or screenshot comparison is created. Recorded images do not imply human approval.",
    },
    workflow: [
      "Project Tests integration execution uses separate primary .redpact/integration-defaults.json with the selection schema. GET/PUT /api/projects/:id/integration-defaults and the Integration defaults form read or save these choices without execution. If absent, configured dependency modes are selected in order mock, isolated, shared-local, remote; roots use applicationServices or Compose services outside dependency modes. Invalid plans require correction; saved defaults never silently fall back. MCP run_tests and worktree submission execution retain their explicit/saved worktree selection contract.",
      'Environment strings are allowed regardless of variable names. Keep public endpoints, mock inputs and internal configuration as literal key/value strings. For required connection authentication keys, declare {"secret":"KEY_NAME"} without a value and call request_keys with the observed projectId and only the required missing names during init. The user enters values in the MCP input card, or directly in the corresponding Project dependencies row if the host cannot show MCP Apps. Do not ask the user to send credentials through the agent or read the private-secrets runtime directory. Missing values are valid configuration but block execution when selected. Project values override server environment references; explicit blanks remain unavailable. Secret values are redacted from logs; ordinary strings are not.',
      "For unit tests, configure optional unitTests with dockerfile (project-relative Dockerfile), command, cwd (project-relative, default .), and patterns (project-relative glob patterns). Commands run inside a fresh Testcontainers runtime built from the selected worktree, without host node_modules or venv. The Dockerfile installs dependencies and copies source to /workspace; cwd resolves beneath /workspace. Containers and execution data are removed after completion or cancellation; Docker build caches and evidence remain. Unit containers do not require Compose. Unit patterns must not include tests.directory, which defaults to the Git-tracked root integration directory. The file patterns only select changed source for viewing, never command arguments. Use the Unit Test viewer or POST /api/worktrees/:id/unit-tests/run; inspect/cancel through /api/unit-runs/:id. Existing MCP run_tests remains managed integration execution.",
      "Inspect the application's manifests, lockfiles, build/start commands, environment variables, SDK and mock behavior, and existing container definitions.",
      "For managed integration tests, initial configuration includes authoring missing Dockerfile, .dockerignore and Compose files for the actual application and required services. Reuse existing definitions or suitable application images. Missing container files alone do not require user clarification; infer setup from the project and ask only for requirements that cannot be determined.",
      "Account for build context, runtime files, writable storage, container-reachable listening addresses, fixed internal ports and readiness checks. Preserve application access controls. Do not invent services or mock modes; dependencies may be empty when the application has no selectable dependencies.",
      "Only isolated, shared-local, remote and mock dependency modes are accepted. Isolated runs actual dependency Compose services; mock requires implemented simulation in the app or a stub container; shared-local connects to an existing local real service; remote connects to an existing remote real service. Neither connection mode provisions or cleans up dependency services. Sandbox/staging/production are remote connection targets, never mode names. Declare missing or unavailable modes in assessments, with reasons and source evidence, rather than adding fake executable modes. Recommendations never select or implement a mode. Application services identify the code under review using existing Compose service names; relationships describe app-to-app or app-to-dependency usage with source evidence and never activate services.",
      "During init, assess all four dependency approaches from source, Compose and verified provider capabilities. Prefer practical real isolated dependencies for local review; if self-hosting is unavailable, recommend an implementable mock for local verification, especially when an remote sandbox cannot be used. Check server clients, browser SDKs and webhooks; a unit-test fake alone is not a runtime mode. Init-only setup recommends missing feature work without implementing it or registering a fake mode. Explicit real API verification takes precedence over mock recommendations. Omit uncertain assessments and report them as unassessed; never fabricate evidence or provider support.",
      "Separate application role from execution mode: multiple web/API/worker application nodes can be developed together, and one logical dependency can span multiple containers. Author observed app-to-app and app-to-dependency relationships using actual source locations, not Compose ordering alone. Preserve user-authored topology and unrelated settings on repeated init. Invalid old mode names require deliberate evidence-based reauthoring and affected selection review, not compatibility readers or blind renaming.",
      "Write one project-wide .redpact/settings.json under rulesRoot (the primary checkout). Linked worktrees inherit it and may add .redpact/dependencies.override.json under projectRoot for scoped dependency changes. Compose and test paths resolve in the execution worktree. Preserve existing unrelated keys and omitted defaults; read the authored file before editing instead of replacing it with the example. No registration command is needed.",
      "Call configure validate with the absolute execution path after editing. Supply selection to preview a managed execution plan; configure does not load or save selection.json. Without selection, validation checks configuration only.",
      "Author .redpact/tracking.json in rulesRoot for mainBranch and hideMerged. Author .redpact/selection.json in each execution projectRoot with services and select, separately from shared settings. Accepted new-environment runs remember services and modes per worktree. Later run_tests calls may omit selection to reuse those choices; explicit selection takes precedence. The worktree Environment screen or PUT /api/worktrees/:id/selection saves choices without execution. Saved choices are revalidated and never grant approval.",
      "For configuration-only requests, finish after validation and report deferred readiness checks. When managed integration test execution is requested, call run_tests with path and selection or saved choices. Poll get_run for preparation and test results. Temporary environments are cleaned up automatically. Users manage early cancellation and cleanup retries in the web UI; do not issue substitute HTTP cleanup requests.",
    ],
    limits: [
      "Strict JSON, at most 256 KiB; no comments, duplicate keys, unknown fields, version field or imports. File paths must be normalized project-relative paths without symlinks; unitTests.cwd also accepts . and unitTests.patterns contains project-relative globs.",
      "Project connection creates missing settings with empty Compose/dependency catalogs and test defaults. Empty settings are valid for inspection; managed integration execution requires configured Compose services. Existing files are preserved and configure reads never create files.",
      "At most 10 Compose files, 100 dependencies, 4 fixed modes per dependency, 100 services/targets and 100 variables per target.",
      "Mode names are fixed: isolated, shared-local, remote, mock. Only configured modes may be selected. Nonempty services starts containers; env applies to named active services. Redpact does not implement SDKs or mocking. Optional applicationServices and relationships are authored topology, not runtime proof. At most 100 app nodes, 500 relationships and 20 evidence locations per relationship/assessment.",
      "Select every dependency exactly once. Roots plus selected services follow fixed Compose prerequisites. Environment targets and test bindings never activate services.",
      "Explicit environment values override Compose defaults; omission preserves defaults. Use unset for removal. Conflicting selected writes fail.",
      "Internal addresses remain fixed application values. Host-test service URLs use observed dynamically mapped ports. Secrets are references resolved only during preparation.",
      "Validation never starts containers or proves readiness. Changing modes or inputs requires a new environment.",
    ],
  }
}
export function publicSettings(result: SettingsResult) {
  return {
    valid: result.valid,
    file: result.file,
    issues: result.issues,
    digest: result.digest,
    ...(result.bundle
      ? { bundle: { files: result.bundle.files.map(({ path, sha256 }) => ({ path, sha256 })) } }
      : {}),
    ...(result.plan ? { plan: result.plan } : {}),
  }
}
