import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createCaptureRunner } from "../src/adapters/playwright/runner.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { Environment } from "../src/core/types/environment.js"
import type { CaptureRun } from "../src/core/types/playwright.js"

test.skipIf(!process.env.REDPACT_APPLICATION_IMAGE)(
  "실제 앱의 모든 이미지 파일 뷰어를 검증한다",
  async () => {
    const directory =
      process.env.REDPACT_CAPTURE_EVIDENCE_DIR ?? (await mkdtemp(join(tmpdir(), "redpact-images-")))
    await mkdir(directory, { recursive: true })
    const ownerId = randomUUID(),
      environmentId = randomUUID(),
      id = randomUUID()
    const projectRoot = resolve(import.meta.dirname, "../../..")
    const settings = settingsSchema.parse({
      playwright: {
        directory: "app/server/test/fixtures/image-viewer",
        targets: { images: { purpose: "capture", testMatch: ["images.pw.mjs"] } },
        service: "app",
        port: 54318,
        viewport: { width: 1440, height: 900 },
      },
    }).playwright!
    const runner = createCaptureRunner(directory, ownerId)
    const run = {
      version: 1,
      id,
      target: "images",
      purpose: "capture",
      worktreeId: "native-image-check",
      projectId: "redpact",
      projectRoot,
      revision: null,
      settings,
      selection: { services: ["app"], select: {} },
      settingsDigest: "native-image-check",
      sourceDigest: "",
      appDigest: "",
      createdAt: new Date().toISOString(),
      state: "running",
      before: { state: "unavailable", cases: [] },
      after: { state: "running", cases: [] },
    } as CaptureRun
    const docker = async (args: string[]) =>
      (await execa("docker", args, { timeout: 60000 })).stdout.trim()
    let target = ""
    try {
      target = await docker([
        "run",
        "-d",
        "--label",
        `io.redpact.owner=${ownerId}`,
        "--label",
        `io.redpact.environment=${environmentId}`,
        process.env.REDPACT_APPLICATION_IMAGE!,
      ])
      const seed = await readFile(
        join(projectRoot, "app/server/test/fixtures/image-viewer/seed.cjs"),
        "utf8",
      )
      await execa("docker", ["exec", "-i", target, "node"], { input: seed })
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
      const environment = {
        id: environmentId,
        ownerId,
        runtimeId: await docker(["info", "--format", "{{.ID}}"]),
        resources: [{ kind: "container", id: target, service: "app" }],
      } as Environment
      const evidence = await runner.execute(
        run,
        "after",
        environment,
        new AbortController().signal,
        (patch) => Object.assign(run.after, patch),
      )
      expect(evidence.cases.flatMap((item) => item.errors)).toEqual([])
      expect(evidence.outcome).toBe("passed")
      expect(evidence.cases).toHaveLength(1)
      expect(
        evidence.cases
          .flatMap((item) => item.artifacts)
          .filter((item) => item.contentType === "image/png"),
      ).toHaveLength(10)
    } finally {
      if (target) {
        await docker(["rm", "-f", target])
      }
    }
  },
  180000,
)
