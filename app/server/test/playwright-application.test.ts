import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createCaptureRunner } from "../src/adapters/playwright/runner.js"
import { createCaptureStore } from "../src/adapters/storage/captures.js"
import { executionSettingsSchema } from "../src/core/execution-settings.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { Environment } from "../src/core/types/environment.js"
import type { CaptureRun } from "../src/core/types/playwright.js"

// The image must be built from this checkout's e2e/Dockerfile before opting in.
// This native adapter check is separate from connected managed acceptance evidence.
test.skipIf(!process.env.REDPACT_APPLICATION_IMAGE).each(["capture", "functional"] as const)(
  "실제 앱에서 %s 목적만 실행하고 산출물을 보관한다",
  async (purpose) => {
    const root =
      process.env.REDPACT_CAPTURE_EVIDENCE_DIR ??
      (await mkdtemp(join(tmpdir(), "redpact-app-capture-")))
    await mkdir(root, { recursive: true })
    const id = randomUUID(),
      ownerId = randomUUID(),
      environmentId = randomUUID()
    const projectRoot = resolve(import.meta.dirname, "../../..")
    const runner = createCaptureRunner(root, ownerId),
      store = createCaptureStore(root)
    const settings = settingsSchema.parse({
      playwright: {
        targets: {
          captures: { purpose: "capture", testMatch: ["project/captures/**/*.spec.ts"] },
          functional: {
            purpose: "functional",
            testMatch: ["project/tests/**/*.spec.ts"],
          },
        },
        service: "app",
        port: 54320,
        locale: "ko-KR",
        uiLanguage: "ko",
        timezoneId: "Asia/Seoul",
        video: true,
      },
    }).playwright!
    let targetName = "functional"
    let targetPurpose: CaptureRun["purpose"] = "functional"
    if (purpose === "capture") {
      targetName = "captures"
      targetPurpose = "capture"
    }
    const run: CaptureRun = {
      version: 1,
      target: targetName,
      purpose: targetPurpose,
      id,
      worktreeId: "native-application-check",
      projectId: "redpact",
      projectRoot,
      revision: null,
      settings,
      selection: { services: ["app"], select: {} },
      settingsDigest: "native-adapter-check",
      sourceDigest: "",
      appDigest: "",
      createdAt: new Date().toISOString(),
      state: "running",
      before: { state: "unavailable", cases: [] },
      after: { state: "running", cases: [] },
    }
    const docker = async (args: string[]) =>
      (await execa("docker", args, { timeout: 60000 })).stdout.trim()
    const projectName = `redpact-${environmentId}`
    const network = `${projectName}_redpact-runner`
    let networkCreated = false
    let target = ""
    try {
      await docker([
        "network",
        "create",
        "--label",
        `com.docker.compose.project=${projectName}`,
        "--label",
        "com.docker.compose.network=redpact-runner",
        "--label",
        `io.redpact.owner=${ownerId}`,
        "--label",
        `io.redpact.environment=${environmentId}`,
        network,
      ])
      networkCreated = true
      target = await docker([
        "run",
        "-d",
        "--network",
        network,
        "--network-alias",
        "app.redpact.test",
        "--label",
        `io.redpact.owner=${ownerId}`,
        "--label",
        `io.redpact.environment=${environmentId}`,
        process.env.REDPACT_APPLICATION_IMAGE!,
      ])
      await expect
        .poll(
          async () => {
            try {
              await docker([
                "exec",
                target,
                "node",
                "-e",
                "fetch('http://127.0.0.1:54318/api/health').then(r=>process.exit(r.ok?0:1))",
              ])
              return true
            } catch {
              return false
            }
          },
          { timeout: 30000 },
        )
        .toBe(true)
      run.sourceDigest = await runner.captureSources(id, projectRoot, settings)
      const env: Environment = {
        id: environmentId,
        ownerId,
        projectName,
        settings: executionSettingsSchema.parse({
          environment: { compose: { files: [] } },
          tests: {},
        }),
        plan: {
          activeServices: ["app"],
          excludedServices: [],
          bindings: {},
          prerequisites: {},
          reasons: {},
        },
        endpoints: {
          "app:54320": { host: "app.redpact.test", port: 54320 },
          "app:54319": { host: "app.redpact.test", port: 54319 },
        },
        runtimeId: await docker(["info", "--format", "{{.ID}}"]),
        resources: [{ kind: "container", id: target, service: "app" }],
        requestId: randomUUID(),
        target: {
          projectId: run.projectId,
          worktreeId: run.worktreeId,
          projectRoot,
          checkoutRoot: projectRoot,
        },
        specification: settingsSchema.parse({ services: ["app"] }),
        selection: { services: ["app"], select: {} },
        bundle: [],
        settingsDigest: "native-adapter-check",
        inputDigest: "native-adapter-check",
        state: "ready",
        lifecycle: "run",
        runIds: [],
        services: [{ name: "app", job: false }],
        errors: [],
        createdAt: run.createdAt,
        updatedAt: run.createdAt,
      }
      const evidence = await runner.execute(
        run,
        "after",
        env,
        new AbortController().signal,
        (patch) => {
          Object.assign(run.after, patch)
          store.save(run)
        },
      )
      Object.assign(run.after, evidence, { state: "finished" })
      run.state = "finished"
      run.outcome = evidence.outcome === "passed" ? "passed" : "failed"
      run.finishedAt = new Date().toISOString()
      store.save(run)
      expect(evidence.cases.flatMap((c) => c.errors)).toEqual([])
      expect(evidence.outcome).toBe("passed")
      const expectedFiles = {
        capture: [
          ...Array(2).fill("project/captures/chat-review.spec.ts"),
          ...Array(3).fill("project/captures/execution-approval.spec.ts"),
          ...Array(2).fill("project/captures/integration-approval.spec.ts"),
          "project/captures/mcp-app.spec.ts",
          ...Array(2).fill("project/result-rows.ts"),
        ],
        functional: [
          ...Array(2).fill("project/tests/chat-review.spec.ts"),
          ...Array(5).fill("project/tests/execution-approval.spec.ts"),
          "project/tests/mcp-app.spec.ts",
          ...Array(2).fill("project/result-rows.ts"),
          "project/tests/window-controls.spec.ts",
        ],
      }
      expect(evidence.cases.map((item) => item.file).sort()).toEqual(expectedFiles[purpose].sort())
      const artifacts = evidence.cases.flatMap((c) => c.artifacts)
      const images = artifacts.filter((artifact) => artifact.contentType === "image/png")
      if (purpose === "functional") {
        expect(images).toHaveLength(0)
      }
      if (purpose === "capture") {
        const checkpoints = [
          "MCP Apps / Unit / 승인 대기",
          "MCP Apps / 환경 / 고정 의존성",
          ...[1280, 390].flatMap((width) =>
            [
              "실행 링크 안내",
              "잘못된 링크",
              "실행 검토 / 승인 대기",
              "Integration 실행 검토 / 승인 대기와 서비스",
              "Unit 기록",
              "Integration 결과",
              "Integration 제출 원문",
              "Playwright 기록 이미지",
              "Playwright 실행 원문",
              "실행 이력",
            ].map((label) => `${width}px / ${label}`),
          ),
        ]
        expect(images.map((artifact) => artifact.name).sort()).toEqual(checkpoints.sort())
        for (const artifact of images) {
          const bytes = Buffer.from((await store.artifact(run, "after", artifact.id)).data)
          const dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
          const width = /^(1280|390)px/.exec(artifact.name)?.[1]
          expect(dimensions, artifact.name).toEqual(
            width ? { width: Number(width), height: 900 } : settings.viewport,
          )
        }
      }
      await runner.stop(run, "after")
      await docker(["rm", "-fv", target])
      target = ""
      await runner.removeInputs(id)
      expect(await store.source(run, "project/captures/chat-review.spec.ts")).toContain(
        "실행 링크 안내와 잘못된 링크의 진단을 촬영한다",
      )
      for (const artifact of artifacts) {
        expect((await store.artifact(run, "after", artifact.id)).data.length).toBe(artifact.bytes)
      }
      console.log(`Native application capture: ${join(root, "playwright-runs", `${id}.json`)}`)
    } finally {
      await runner.stop(run, "after")
      if (target) {
        await docker(["rm", "-fv", target])
      }
      await runner.removeInputs(id)
      if (networkCreated) {
        await docker(["network", "rm", network])
      }
      if (!process.env.REDPACT_CAPTURE_EVIDENCE_DIR) {
        await rm(root, { recursive: true, force: true })
      }
    }
  },
  600000,
)
