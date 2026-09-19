import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createCaptureStore } from "../src/adapters/storage/captures.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { CaptureRun } from "../src/core/types/playwright.js"
import { resourceLimit } from "./helpers/resource-limit.js"

test("실행환경이 없어도 저장된 이미지를 읽으며 변경된 바이트는 거부한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "captures-"))
  try {
    const store = createCaptureStore(root),
      id = randomUUID(),
      aid = randomUUID(),
      data = Buffer.from("captured evidence")
    const run: CaptureRun = {
      version: 1,
      target: "captures",
      purpose: "capture",
      id,
      worktreeId: "w",
      projectId: "p",
      projectRoot: "/gone",
      revision: null,
      settings: settingsSchema.parse({
        playwright: {
          targets: { captures: { purpose: "capture", testMatch: ["**/*.spec.{ts,js,mts,mjs}"] } },
          service: "app",
          port: 3000,
        },
      }).playwright!,
      selection: { services: ["app"], select: {} },
      settingsDigest: "s",
      sourceDigest: "s",
      appDigest: "s",
      createdAt: new Date().toISOString(),
      state: "finished",
      outcome: "passed",
      before: { state: "unavailable", cases: [], resourceLimit },
      after: {
        state: "finished",
        cases: [
          {
            id: "case",
            title: "화면",
            file: "app.spec.ts",
            status: "passed",
            duration: 1,
            errors: [],
            steps: [],
            artifacts: [
              {
                id: aid,
                name: "화면",
                contentType: "image/png",
                bytes: data.length,
                sha256: createHash("sha256").update(data).digest("hex"),
              },
            ],
          },
        ],
      },
    }
    await mkdir(join(root, "playwright-runs", id, "after"), { recursive: true })
    await writeFile(join(root, "playwright-runs", id, "after", aid), data)
    store.save(run)
    expect(createCaptureStore(root).list()[0].before.resourceLimit).toEqual(resourceLimit)
    expect((await createCaptureStore(root).artifact(run, "after", aid)).data).toEqual(data)
    await writeFile(join(root, "playwright-runs", id, "after", aid), "changed")
    await expect(store.artifact(run, "after", aid)).rejects.toThrow("integrity")
    await expect(store.artifact(run, "after", "../escape")).rejects.toThrow("not found")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("워크트리 실행 입력이 사라져도 캡처 당시 시나리오 원본을 읽는다", async () => {
  const { createCaptureRunner } = await import("../src/adapters/playwright/runner.js")
  const root = await mkdtemp(join(tmpdir(), "capture-source-")),
    id = randomUUID()
  try {
    const project = join(root, "project"),
      data = join(root, "runtime")
    await mkdir(join(project, "ui-tests"), { recursive: true })
    await writeFile(join(project, "ui-tests", "page.spec.ts"), "captured scenario")
    const settings = settingsSchema.parse({
      playwright: {
        targets: { captures: { purpose: "capture", testMatch: ["**/*.spec.{ts,js,mts,mjs}"] } },
        service: "app",
        port: 3000,
      },
    }).playwright!
    const runner = createCaptureRunner(data, randomUUID())
    const sourceDigest = await runner.captureSources(id, project, settings)
    await runner.removeInputs(id)
    await rm(project, { recursive: true })
    const store = createCaptureStore(data),
      run = { id, sourceDigest } as CaptureRun
    expect(await store.source(run, "page.spec.ts")).toBe("captured scenario")
    await expect(store.source(run, "../escape")).rejects.toThrow()
    await writeFile(
      join(data, "playwright-runs", id, "sources", "page.spec.ts"),
      "modified scenario",
    )
    await expect(store.source(run, "page.spec.ts")).rejects.toThrow("identity")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("워크트리 원본 정리는 기록과 같은 파일만 제거하고 수정된 초안은 보존한다", async () => {
  const { createCaptureRunner } = await import("../src/adapters/playwright/runner.js")
  const root = await mkdtemp(join(tmpdir(), "capture-worktree-"))
  try {
    const project = join(root, "project"),
      data = join(root, "runtime"),
      id = randomUUID()
    await mkdir(join(project, "browser/worktree/captures"), { recursive: true })
    await writeFile(join(project, "browser/worktree/captures/page.ts"), "recorded source")
    const settings = settingsSchema.parse({
      playwright: {
        directory: "browser",
        service: "app",
        port: 3000,
        targets: {
          worktree: {
            scope: "worktree",
            purpose: "capture",
            testMatch: ["worktree/captures/*.ts"],
          },
        },
      },
    }).playwright!
    const runner = createCaptureRunner(data, randomUUID())
    const sourceDigest = await runner.captureSources(id, project, settings)
    const run = { id, settings, projectRoot: project, sourceDigest } as CaptureRun
    await runner.removeInputs(id)
    await writeFile(join(project, "browser/worktree/captures/page.ts"), "new unrecorded draft")
    await expect(runner.cleanupWorktree?.(run) ?? Promise.resolve()).rejects.toThrow("changed")
    const { readFile } = await import("node:fs/promises")
    expect(await readFile(join(project, "browser/worktree/captures/page.ts"), "utf8")).toBe(
      "new unrecorded draft",
    )
    await writeFile(join(project, "browser/worktree/captures/page.ts"), "recorded source")
    await writeFile(join(project, "browser/worktree/.env"), "unrecorded private input")
    await expect(runner.cleanupWorktree(run)).rejects.toThrow("unrecorded")
    await rm(join(project, "browser/worktree/.env"))
    await runner.cleanupWorktree(run)
    await expect(readFile(join(project, "browser/worktree/captures/page.ts"))).rejects.toThrow()
    expect(await createCaptureStore(data).source(run, "worktree/captures/page.ts")).toBe(
      "recorded source",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
