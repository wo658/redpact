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
test
  .skipIf(!process.env.REDPACT_APPLICATION_IMAGE)
  .each(["capture", "functional", "demo"] as const)(
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
            testMatch: ["project/tests/**/!(product-demo).spec.ts"],
          },
          demo: { purpose: "functional", testMatch: ["project/tests/product-demo.spec.ts"] },
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
    if (purpose === "demo") {
      targetName = "demo"
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
      await docker(["network", "create", network])
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
      await docker([
        "exec",
        target,
        "node",
        "-e",
        `
          const { execFileSync } = require("node:child_process")
          const { writeFileSync } = require("node:fs")
          const root = "/tmp/redpact-copy-handoff-fixture"
          const git = (...args) => execFileSync("git", args, { stdio: "pipe" })
          git("init", "-qb", "main", root)
          git("-C", root, "config", "user.name", "Redpact")
          git("-C", root, "config", "user.email", "redpact@example.test")
          writeFileSync(root + "/.gitignore", ".redpact/\\n")
          writeFileSync(root + "/file.txt", "base\\n")
          git("-C", root, "add", ".")
          git("-C", root, "commit", "-qm", "base")
          git("-C", root, "worktree", "add", "-qb", "feature", root + "-feature")
          writeFileSync(root + "/file.txt", "main\\n")
          git("-C", root, "add", ".")
          git("-C", root, "commit", "-qm", "main change")
          writeFileSync(root + "-feature/file.txt", "feature\\n")
          git("-C", root + "-feature", "add", ".")
          git("-C", root + "-feature", "commit", "-qm", "feature change")
        `,
      ])
      await docker([
        "exec",
        target,
        "node",
        "-e",
        `fetch('http://127.0.0.1:54318/api/projects', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'/app',name:'Redpact'})}).then(r=>{if(!r.ok)process.exit(1)})`,
      ])
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
          requiredSecrets: [],
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
      const checkpoints =
        purpose !== "capture"
          ? []
          : [
              "작업공간 / 탐색 / 프로젝트 메뉴",
              "작업공간 / 탐색 / 작업공간 탐색",
              "설정 / 페이지 / 라이트 테마",
              "설정 / 페이지 / 다크 테마",
              "프로젝트 설정 / 실행 구성 / 프로젝트 실행 설정",
              "Git Graph / 페이지 / 커밋 기록",
              "Dependencies / 개요 / 빈 상태",
              "Dependencies / 개요 / 연결된 서비스",
              "Dependencies / 개요 / 서비스 상세",
              "Dependencies / 설정 / 환경변수 목록",
              "Dependencies / 설정 / 환경변수 편집",
              "Dependencies / 설정 / 저장된 값",
              "Dependencies / 도움말 / 열린 대화상자",
              "Playwright / Test / 기능 테스트 목록",
              "Playwright / 실행 기록 / 빈 상태",
              "워크트리 / 리뷰 / 내용 없는 탭 숨김",
              "프로젝트 / Unit / 단위테스트 미설정",
              "프로젝트 / Integration / 통합테스트 소스",
              "Playwright / 스크린샷 / 프로젝트 Playwright 기록",
              "Playwright / Test / 실행 전 기능 테스트 파일",
            ]
      expect(evidence.cases).toHaveLength({ capture: 12, demo: 1, functional: 30 }[purpose])
      const expectedFiles = {
        capture: [
          "project/captures/desktop-update.spec.ts",
          "project/captures/desktop-update.spec.ts",
          "project/captures/desktop-update.spec.ts",
          "project/captures/mcp-app.spec.ts",
          ...Array(4).fill("project/captures/workspace-history.spec.ts"),
          "project/captures/application.spec.ts",
          "project/captures/dependencies.spec.ts",
          "project/captures/problem-notice.spec.ts",
          "project/captures/word-wrap.spec.ts",
        ],
        functional: [
          "project/tests/header-location.spec.ts",
          "project/tests/mcp-app.spec.ts",
          "project/tests/capture-viewport.spec.ts",
          "project/tests/test-code-diff.spec.ts",
          "project/tests/desktop-update.spec.ts",
          "project/tests/desktop-update.spec.ts",
          "project/tests/desktop-update.spec.ts",
          "project/tests/fixed-execution-settings.spec.ts",
          "project/tests/project-management.spec.ts",
          "project/tests/project-management.spec.ts",
          "project/tests/sidebar-controls.spec.ts",
          "project/tests/sidebar-controls.spec.ts",
          "project/tests/workspace-history.spec.ts",
          "project/tests/workspace-history.spec.ts",
          "project/tests/workspace-history.spec.ts",
          "project/tests/workspace-history.spec.ts",
          "project/tests/workspace-tabs.spec.ts",
          "project/tests/workspace-tabs.spec.ts",
          "project/tests/workspace-tabs.spec.ts",
          "project/tests/dependencies.spec.ts",
          "project/tests/copy-handoff.spec.ts",
          "project/tests/git-graph.spec.ts",
          "project/tests/material-icons.spec.ts",
          "project/tests/problem-notice.spec.ts",
          "project/tests/review-header.spec.ts",
          "project/tests/settings.spec.ts",
          "project/tests/settings.spec.ts",
          "project/tests/viewers.spec.ts",
          "project/tests/word-wrap.spec.ts",
          "project/tests/word-wrap.spec.ts",
        ],
        demo: ["project/tests/product-demo.spec.ts"],
      }
      expect(evidence.cases.map((item) => item.file).sort()).toEqual(expectedFiles[purpose].sort())
      let expectedFile = "project/tests/settings.spec.ts"
      if (purpose === "capture") {
        expectedFile = "project/captures/application.spec.ts"
      }
      if (purpose === "demo") {
        expectedFile = "project/tests/product-demo.spec.ts"
      }
      expect(evidence.cases.map((item) => item.file)).toContain(expectedFile)
      if (purpose === "demo") {
        expect(evidence.cases.map((item) => item.file)).toContain(
          "project/tests/product-demo.spec.ts",
        )
      }
      const artifacts = evidence.cases.flatMap((c) => c.artifacts)
      if (purpose === "functional") {
        expect(artifacts.filter((a) => a.contentType === "image/png")).toHaveLength(0)
      }
      if (purpose === "capture") {
        for (const viewport of [
          { name: "데스크톱", width: 1440, height: 1000 },
          { name: "모바일", width: 390, height: 844 },
        ]) {
          for (const theme of ["라이트", "다크"]) {
            for (const state of ["켜짐", "꺼짐"]) {
              const name = `전역 설정 / ${viewport.name} ${theme} / 자동 줄바꿈 ${state}`
              const matches = artifacts.filter((artifact) => artifact.name === name)
              expect(matches, name).toHaveLength(1)
              const bytes = Buffer.from((await store.artifact(run, "after", matches[0]!.id)).data)
              expect(
                { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) },
                name,
              ).toEqual({ width: viewport.width, height: viewport.height })
            }
          }
        }
      }
      expect(artifacts.map((a) => a.name)).toEqual(expect.arrayContaining(checkpoints))
      for (const name of checkpoints) {
        const artifact = artifacts.find((a) => a.name === name)!
        const bytes = Buffer.from((await store.artifact(run, "after", artifact.id)).data)
        const width = bytes.readUInt32BE(16),
          height = bytes.readUInt32BE(20)
        expect(width > 0 && height > 0).toBe(true)
        expect({ width, height }, `${name}: page context must include the header`).toEqual(
          settings.viewport,
        )
      }
      await runner.stop(run, "after")
      await docker(["rm", "-fv", target])
      target = ""
      await runner.removeInputs(id)
      expect(await store.source(run, "project/captures/application.spec.ts")).toContain(
        "앱 문맥에서 설정을 확인",
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
