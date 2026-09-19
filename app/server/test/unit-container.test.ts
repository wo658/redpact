import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createUnitContainer } from "../src/adapters/environment/unit-container.js"
import type { UnitRun } from "../src/core/types/unit-tests.js"

const dockerTest = test.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")
dockerTest(
  "설치된 WT 의존성 없이 컨테이너에서 명령 실행·실패·취소 후 실행 자원을 제거한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "unit-container-"))
    const data = await mkdtemp(join(tmpdir(), "unit-container-data-"))
    const owner = randomUUID()
    const adapter = createUnitContainer(data, owner)
    const records: UnitRun[] = []
    try {
      await mkdir(join(root, "nested"))
      await mkdir(join(root, ".venv"))
      await symlink("/missing-host-python", join(root, ".venv/python"))
      await writeFile(join(root, "nested/input.txt"), "uncommitted WT")
      await writeFile(
        join(root, "unit.Dockerfile"),
        "FROM alpine:3.21\nWORKDIR /workspace\nCOPY . .\n",
      )
      const run = (command: string): UnitRun => ({
        version: 2,
        id: randomUUID(),
        projectId: "p",
        worktreeId: "wt",
        projectRoot: root,
        settings: {
          dockerfile: "unit.Dockerfile",
          cwd: "nested",
          command,
          patterns: ["**/*.test.ts"],
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
      })
      const success = run(
        "test ! -e /workspace/.venv; test ! -e /workspace/node_modules; cat input.txt; pwd; echo container-only > result.txt",
      )
      records.push(success)
      const result = await adapter.execute(success, new AbortController().signal, (change) =>
        Object.assign(success, change),
      )
      expect(result).toMatchObject({ outcome: "command_succeeded", exitCode: 0 })
      expect(result.stdout).toContain("uncommitted WT/workspace/nested")
      await expect(readFile(join(root, "nested/result.txt"))).rejects.toThrow()
      expect(success).toMatchObject({
        containerId: expect.any(String),
        inputDigest: expect.any(String),
        imageId: expect.any(String),
      })
      const expectImageRemoved = async (record: UnitRun) => {
        await expect(
          execa("docker", ["image", "inspect", `redpact-unit:${record.id}`]),
        ).rejects.toThrow()
      }
      const foreign = (await execa("docker", ["create", "alpine:3.21", "true"])).stdout
      try {
        await expect(adapter.stop({ ...success, containerId: foreign })).rejects.toThrow(
          "ownership mismatch",
        )
        expect((await execa("docker", ["inspect", "--format", "{{.Id}}", foreign])).stdout).toBe(
          foreign,
        )
      } finally {
        await execa("docker", ["rm", "-fv", foreign])
      }
      await adapter.stop(success)
      await expectImageRemoved(success)
      await expect(
        readFile(join(data, "unit-sources", success.id, "unit.Dockerfile")),
      ).rejects.toThrow()
      const failure = run("printf failure >&2; exit 7")
      records.push(failure)
      expect(
        await adapter.execute(failure, new AbortController().signal, (change) =>
          Object.assign(failure, change),
        ),
      ).toMatchObject({ outcome: "command_failed", exitCode: 7, stderr: "failure" })
      await adapter.stop(failure)
      await expectImageRemoved(failure)
      const cancelled = run("sleep 300")
      records.push(cancelled)
      const abort = new AbortController()
      const pending = adapter.execute(cancelled, abort.signal, (change) => {
        Object.assign(cancelled, change)
        if (change.containerId) {
          setTimeout(() => abort.abort(), 100)
        }
      })
      expect((await pending).outcome).toBe("cancelled")
      await adapter.stop(cancelled)
      await expectImageRemoved(cancelled)
      const remaining = await execa("docker", [
        "ps",
        "-aq",
        "--filter",
        `label=io.redpact.owner=${owner}`,
      ])
      expect(remaining.stdout).toBe("")
    } finally {
      await Promise.all(records.map((record) => adapter.stop(record)))
      await rm(root, { recursive: true, force: true })
      await rm(data, { recursive: true, force: true })
    }
  },
  180000,
)

test.skipIf(process.env.REDPACT_SELF_UNIT_CONTAINER_TEST !== "1")(
  "현재 실제 WT의 pnpm test를 컨테이너 의존성으로 실행한다",
  async () => {
    const { fileURLToPath } = await import("node:url")
    const root = fileURLToPath(new URL("../../../", import.meta.url))
    const data = await mkdtemp(join(tmpdir(), "redpact-self-unit-"))
    const adapter = createUnitContainer(data, randomUUID())
    const run: UnitRun = {
      version: 2,
      id: randomUUID(),
      projectId: "self",
      worktreeId: "self",
      projectRoot: root,
      settings: {
        dockerfile: "unit.Dockerfile",
        cwd: "app/server",
        // Bound worker fan-out to the default 2 GiB Unit container budget.
        command: "pnpm --filter @redpact/web build && pnpm test --maxWorkers=2",
        patterns: ["app/server/test/*.test.ts"],
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
      const result = await adapter.execute(run, new AbortController().signal, (change) =>
        Object.assign(run, change),
      )
      expect(result.outcome, `${result.stdout}\n${result.stderr}\n${result.error}`).toBe(
        "command_succeeded",
      )
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("passed")
      console.log(
        JSON.stringify({
          inputDigest: run.inputDigest,
          imageId: run.imageId,
          stdout: result.stdout.slice(-1200),
        }),
      )
    } finally {
      await adapter.stop(run)
      await rm(data, { recursive: true, force: true })
    }
  },
  600000,
)

dockerTest(
  "호스트 venv 없이 Dockerfile이 설치한 pytest로 Python 테스트를 실행한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-python-unit-"))
    const data = await mkdtemp(join(tmpdir(), "redpact-python-unit-data-"))
    const adapter = createUnitContainer(data, randomUUID())
    const run: UnitRun = {
      version: 2,
      id: randomUUID(),
      projectId: "python",
      worktreeId: "python-wt",
      projectRoot: root,
      settings: {
        dockerfile: "unit.Dockerfile",
        cwd: ".",
        command: "python -m pytest -q",
        patterns: ["test_*.py"],
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
      await mkdir(join(root, ".venv"))
      await symlink("/obsolete-host-python", join(root, ".venv/python"))
      await writeFile(
        join(root, "unit.Dockerfile"),
        "FROM python:3.12-slim\nRUN pip install --no-cache-dir pytest==8.4.2\nWORKDIR /workspace\nCOPY . .\n",
      )
      await writeFile(
        join(root, "test_runtime.py"),
        "from pathlib import Path\nimport sys\ndef test_runtime():\n    assert sys.platform == 'linux'\n    assert not Path('/workspace/.venv').exists()\n",
      )
      const result = await adapter.execute(run, new AbortController().signal, (change) =>
        Object.assign(run, change),
      )
      expect(result.outcome, `${result.stdout}\n${result.stderr}`).toBe("command_succeeded")
      expect(result.stdout).toContain("1 passed")
    } finally {
      await adapter.stop(run)
      await rm(root, { recursive: true, force: true })
      await rm(data, { recursive: true, force: true })
    }
  },
  300000,
)
