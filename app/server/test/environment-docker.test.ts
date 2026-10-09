import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { loadInstance } from "../src/adapters/storage/instance.js"
import { executionSettingsSchema } from "../src/core/execution-settings.js"

dockerTest(
  "기존 수동 환경의 준비 중·준비 완료 기록을 복구하고 실제 Docker 자원을 정리한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-compose-restart-"))
    const projectRoot = join(root, "project")
    const data = join(root, "state")
    await mkdir(join(projectRoot, ".redpact"), { recursive: true })
    const composePath = join(projectRoot, "compose.yaml")
    const compose =
      "services:\n  probe:\n    image: postgres:17-alpine\n    command: [sleep, '3600']\n    healthcheck:\n      test: [CMD, 'true']\n      interval: 1s\n      timeout: 1s\n      retries: 120\n"
    await writeFile(composePath, compose)
    await writeFile(
      join(projectRoot, ".redpact/settings.json"),
      JSON.stringify({ composeFiles: ["compose.yaml"], services: ["probe"] }),
    )
    const launch = async () => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
          "serve",
          "--project",
          projectRoot,
          "--data-dir",
          data,
          "--port",
          "0",
        ],
        { env: { ...process.env, REDPACT_TOKEN: undefined }, stdio: ["ignore", "pipe", "pipe"] },
      )
      const exited = once(child, "exit")
      let output = ""
      child.stdout.on("data", (chunk) => {
        output += chunk
      })
      child.stderr.on("data", (chunk) => {
        output += chunk
      })
      await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 20000 }).toBeTruthy()
      const base = `http://127.0.0.1:${/"port":(\d+)/.exec(output)?.[1]}`
      const request = async (path: string, body?: object) => {
        const response = await fetch(base + path, {
          headers: { "Content-Type": "application/json" },
          ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
        })
        const text = await response.text()
        expect(response.ok, `${response.status}: ${path}\n${text}`).toBe(true)
        return JSON.parse(text)
      }
      return { child, exited, request }
    }
    let server = await launch()
    let worktreeId = ""
    const fixtureIds: string[] = []
    try {
      const [project] = await server.request("/api/projects")
      const [worktree] = await server.request(`/api/projects/${project.id}/worktrees`)
      worktreeId = worktree.id
      const validation = await createSettingsService(projectRoot).read()
      expect(validation.valid, JSON.stringify(validation.issues)).toBe(true)
      if (!validation.settings || !validation.digest || !validation.plan || !validation.bundle) {
        throw new Error("Missing fixture execution settings")
      }
      for (const state of ["ready", "preparing"] as const) {
        server.child.kill("SIGTERM")
        expect((await server.exited)[0]).toBe(0)
        const runtime = openStore(data)
        const { instance } = loadInstance(data)
        const id = randomUUID()
        fixtureIds.push(id)
        const projectName = `redpact-${instance.id}-${createHash("sha256").update(project.id).digest("hex").slice(0, 16)}`
        const labels = [
          "--label",
          `io.redpact.owner=${instance.id}`,
          "--label",
          `io.redpact.environment=${id}`,
          "--label",
          `com.docker.compose.project=${projectName}`,
        ]
        const environmentDirectory = join(data, "environments", id)
        try {
          await execa("docker", ["network", "create", ...labels, `${projectName}_legacy`])
          await execa("docker", [
            "run",
            "-d",
            ...labels,
            "--label",
            "com.docker.compose.service=probe",
            "--network",
            `${projectName}_legacy`,
            "--health-cmd",
            state === "ready" ? "true" : "false",
            "--health-interval",
            "1s",
            "--health-timeout",
            "1s",
            "--health-retries",
            "120",
            "postgres:17-alpine",
            "sh",
            "-c",
            "echo retained-service-log; sleep 3600",
          ])
          const time = new Date().toISOString()
          // Seed a previous runtime's record; retired HTTP creation must remain unavailable.
          runtime.store.saveEnvironment({
            id,
            requestId: randomUUID(),
            ownerId: instance.id,
            projectName,
            target: {
              projectId: project.id,
              worktreeId,
              projectRoot: worktree.projectRoot,
              checkoutRoot: worktree.checkoutRoot,
            },
            settings: executionSettingsSchema.parse({
              environment: { compose: { files: validation.settings.composeFiles } },
              tests: {},
            }),
            specification: validation.settings,
            selection: { services: ["probe"], select: {} },
            plan: validation.plan,
            bundle: validation.bundle.files.map(({ path, sha256 }) => ({ path, sha256 })),
            settingsDigest: validation.digest,
            inputDigest: `retained-${state}`,
            runtimeId: (await execa("docker", ["info", "--format", "{{.ID}}"])).stdout.trim(),
            state,
            lifecycle: "manual",
            runIds: [],
            resources: [],
            endpoints: {},
            services: [{ name: "probe", job: false }],
            errors: [],
            createdAt: time,
            updatedAt: time,
          })
          await mkdir(join(environmentDirectory, "source"), { recursive: true })
          await writeFile(join(environmentDirectory, "source", "captured-input"), "retained input")
          await writeFile(
            join(environmentDirectory, "preparation.log"),
            "retained preparation evidence",
          )
        } finally {
          runtime.close()
        }
        server = await launch()
        const recovered = await server.request(`/api/environments/${id}`)
        expect(recovered).toMatchObject({
          id,
          state: "stopped",
          lifecycle: "manual",
          inputDigest: `retained-${state}`,
          settingsDigest: validation.digest,
          resources: [],
        })
        expect(
          (await server.request(`/api/environments?worktreeId=${worktreeId}`)).map(
            (item: { id: string }) => item.id,
          ),
        ).toContain(id)
        expect(
          (await execa("docker", ["ps", "-aq", "--filter", `label=io.redpact.environment=${id}`]))
            .stdout,
        ).toBe("")
        expect(
          (
            await execa("docker", [
              "network",
              "ls",
              "-q",
              "--filter",
              `label=io.redpact.environment=${id}`,
            ])
          ).stdout,
        ).toBe("")
        await expect(
          readFile(join(environmentDirectory, "source", "captured-input")),
        ).rejects.toMatchObject({ code: "ENOENT" })
        expect(await readFile(join(environmentDirectory, "preparation.log"), "utf8")).toBe(
          "retained preparation evidence",
        )
        expect(await readFile(join(environmentDirectory, "services.log"), "utf8")).toContain(
          "retained-service-log",
        )
      }
    } finally {
      if (server.child.exitCode === null && server.child.signalCode === null) {
        if (worktreeId) {
          const envs = await server.request(`/api/environments?worktreeId=${worktreeId}`)
          for (const env of envs) {
            if (env.state !== "stopped") {
              await server.request(`/api/environments/${env.id}/stop`, {})
              await expect
                .poll(async () => (await server.request(`/api/environments/${env.id}`)).state, {
                  timeout: 30000,
                })
                .toBe("stopped")
            }
          }
        }
        server.child.kill("SIGTERM")
        await server.exited
      }
      for (const id of fixtureIds) {
        const containers = (
          await execa("docker", ["ps", "-aq", "--filter", `label=io.redpact.environment=${id}`])
        ).stdout
          .split(/\s+/)
          .filter(Boolean)
        if (containers.length) {
          await execa("docker", ["rm", "-fv", ...containers])
        }
        const networks = (
          await execa("docker", [
            "network",
            "ls",
            "-q",
            "--filter",
            `label=io.redpact.environment=${id}`,
          ])
        ).stdout
          .split(/\s+/)
          .filter(Boolean)
        if (networks.length) {
          await execa("docker", ["network", "rm", ...networks])
        }
      }
      await rm(root, { recursive: true, force: true })
    }
  },
  150000,
)

dockerTest(
  "Order Desk 스크립트가 실행별 임시 환경에서 HTTP 앱을 검증하고 정리한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-order-desk-"))
    const project = join(root, "project"),
      data = join(root, "data")
    await cp(fileURLToPath(new URL("../../../examples/order-desk/", import.meta.url)), project, {
      recursive: true,
    })
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
        "serve",
        "--data-dir",
        data,
        "--port",
        "0",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    )
    const exited = once(child, "exit")
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    try {
      await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 20000 }).toBeTruthy()
      const base = `http://127.0.0.1:${/"port":(\d+)/.exec(output)?.[1]}`
      const result = await execa(process.execPath, [join(project, "tools/review.mjs"), "http"], {
        env: { REDPACT_URL: base },
        timeout: 240000,
        reject: false,
      })
      expect(result.exitCode, result.stdout + result.stderr).toBe(0)
      expect(result.stdout).toContain('"observed":"passed"')
      const [p] = await (await fetch(`${base}/api/projects`)).json()
      const [worktree] = await (await fetch(`${base}/api/projects/${p.id}/worktrees`)).json()
      const environments = await (
        await fetch(`${base}/api/environments?worktreeId=${worktree.id}`)
      ).json()
      expect(environments).toHaveLength(1)
      expect(environments[0].state).toBe("stopped")
      expect(environments[0].lifecycle).toBe("run")
    } finally {
      child.kill("SIGTERM")
      await exited
      await rm(root, { recursive: true, force: true })
    }
  },
  270000,
)
