import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { containersWithLabels, inspectImage } from "../src/adapters/environment/runtime.js"
import { createUnitContainer } from "../src/adapters/environment/unit-container.js"
import type { UnitRun } from "../src/core/types/unit-tests.js"
import { createTestVitestRunner } from "./helpers/container-runner.js"

const dockerTest = test.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")

dockerTest(
  "이미지 빌드 실패의 원본 진단을 보존하고 실행 자원을 정리한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-failed-build-"))
    const data = await mkdtemp(join(tmpdir(), "redpact-failed-build-data-"))
    const owner = randomUUID()
    const adapter = createUnitContainer(data, owner)
    const run: UnitRun = {
      version: 2,
      id: randomUUID(),
      projectId: "p",
      worktreeId: "wt",
      projectRoot: root,
      settings: {
        dockerfile: "unit.Dockerfile",
        cwd: ".",
        command: "true",
        patterns: ["*.test.ts"],
      },
      runtimeId: null,
      containerId: null,
      imageId: null,
      inputDigest: null,
      cleanup: { state: "pending", error: null },
      state: "running",
      outcome: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      truncated: false,
      error: null,
    }
    try {
      await writeFile(
        join(root, "unit.Dockerfile"),
        "FROM alpine:3.21\nRUN echo issue20-build-cause >&2; exit 37\n",
      )
      const result = await adapter
        .execute(run, new AbortController().signal, (change) => Object.assign(run, change))
        .catch((error) => error)
      expect(result).toBeInstanceOf(Error)
      expect(result.stderr).toContain("issue20-build-cause")
      await adapter.stop(run)
      expect(await containersWithLabels([`io.redpact.owner=${owner}`])).toEqual([])
      expect(await inspectImage(`redpact-unit:${run.id}`)).toBeNull()
    } finally {
      await adapter.stop(run)
      await rm(root, { recursive: true, force: true })
      await rm(data, { recursive: true, force: true })
    }
  },
  180000,
)

dockerTest(
  "결과 디렉터리가 사라져도 테스트 stderr는 정리 전에 저장된다",
  async () => {
    const data = await mkdtemp(join(tmpdir(), "redpact-missing-report-"))
    const runner = createTestVitestRunner(data)
    const id = randomUUID()
    try {
      const result = await runner
        .execute(
          {
            id: randomUUID(),
            workItemId: randomUUID(),
            digest: "failure-log-test",
            runnerVersion: runner.version,
            parsed: [],
            createdAt: new Date().toISOString(),
            files: [
              {
                path: "missing-output.test.ts",
                source: `
        import {test} from 'vitest';
        import {rmSync} from 'node:fs';
        test('결과 수집 실패 전에 실제 오류를 출력한다', () => {
          rmSync('/review/output', {recursive:true,force:true});
          process.stderr.write('issue20-original-exec-cause\\n');
          process.exit(23);
        });
      `,
              },
            ],
          },
          id,
          new AbortController().signal,
        )
        .catch((error) => error)
      expect(result).toBeDefined()
      expect(await readFile(join(data, "runs", id, "stderr.log"), "utf8")).toContain(
        "issue20-original-exec-cause",
      )
    } finally {
      await rm(data, { recursive: true, force: true })
    }
  },
  240000,
)

dockerTest(
  "실제 이미지 빌드 실패 진단을 실행 API와 복사 API에서 읽고 재시작 후에도 보존한다",
  async () => {
    const { mkdir } = await import("node:fs/promises")
    const { createSettingsFiles } = await import("../src/adapters/settings/editor-files.js")
    const { readJsonSettings } = await import("../src/adapters/settings/json.js")
    const { createUnitTestFiles } = await import("../src/adapters/sources/unit-tests.js")
    const { createUnitRunStore } = await import("../src/adapters/storage/unit-runs.js")
    const { createApp } = await import("../src/app.js")
    const { createSettingsEditor } = await import("../src/workflows/settings-editor.js")
    const { createUnitTests } = await import("../src/workflows/unit-tests.js")
    const { createRunQueries } = await import("../src/workflows/run-queries.js")
    const root = await mkdtemp(join(tmpdir(), "redpact-build-api-"))
    const data = await mkdtemp(join(tmpdir(), "redpact-build-api-data-"))
    let close: (() => Promise<void>) | undefined
    try {
      await mkdir(join(root, ".redpact"))
      await writeFile(
        join(root, "unit.Dockerfile"),
        "FROM alpine:3.21\nRUN echo issue20-public-build-cause >&2; exit 37\n",
      )
      const file = join(root, ".redpact/settings.json")
      await writeFile(
        file,
        JSON.stringify({
          unitTests: {
            dockerfile: "unit.Dockerfile",
            command: "true",
            cwd: ".",
            patterns: ["*.test.ts"],
          },
        }),
      )
      const editor = createSettingsEditor({
        projects: { root: async () => root },
        directory: data,
        files: createSettingsFiles(),
        validateProject: (path, source) => readJsonSettings(path, undefined, { file, source }),
      })
      const owner = randomUUID()
      const store = createUnitRunStore(data)
      const deps = {
        worktrees: {
          resolve: async () => ({
            worktree: { id: "w", projectId: "p", projectRoot: root },
            git: {
              mergeBase: async () => {
                throw new Error("No Git")
              },
            },
          }),
        },
        projects: { tracking: async () => ({ mainBranch: null, hideMerged: false }) },
        settings: editor,
        files: createUnitTestFiles(),
        command: createUnitContainer(data, owner),
        store,
      }
      const service = createUnitTests(deps)
      close = () => service.close()
      const app = createApp({
        unitTests: service,
        runs: createRunQueries({} as never, undefined, {
          units: () => store.list(),
          captures: () => [],
        }),
      } as never)
      const started = await app.request("/api/worktrees/w/unit-tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      expect(started.status).toBe(200)
      const run = (await started.json()) as UnitRun
      await expect.poll(() => service.get(run.id).state, { timeout: 120000 }).toBe("finished")
      const read = await app.request(`/api/unit-runs/${run.id}`)
      expect(read.status).toBe(200)
      const result = (await read.json()) as UnitRun
      expect(result).toMatchObject({ outcome: "execution_error", cleanup: { state: "removed" } })
      expect(result.stderr).toContain("issue20-public-build-cause")
      const copied = await app.request(`/api/runs/executions/unit/${run.id}/copy`)
      expect(copied.status).toBe(200)
      expect((await copied.json()).text).toContain("issue20-public-build-cause")
      const listing = await app.request("/api/worktrees/w/unit-tests")
      expect((await listing.json()).runs[0].id).toBe(run.id)
      await service.close()
      const restarted = createUnitTests({ ...deps, store: createUnitRunStore(data) })
      close = () => restarted.close()
      expect(restarted.get(run.id).stderr).toBe(result.stderr)
      expect(await containersWithLabels([`io.redpact.owner=${owner}`])).toEqual([])
    } finally {
      await close?.()
      await rm(root, { recursive: true, force: true })
      await rm(data, { recursive: true, force: true })
    }
  },
  180000,
)
