import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

import { spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { execa } from "execa"

dockerTest(
  "서버 충돌 후 수동 Container를 복구하고 중단된 준비 자원을 정리한다",
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
    try {
      const [project] = await server.request("/api/projects")
      const [worktree] = await server.request(`/api/projects/${project.id}/worktrees`)
      worktreeId = worktree.id
      const { environment: env } = await server.request(
        `/api/projects/${project.id}/test-container/start`,
        {},
      )
      await expect
        .poll(async () => (await server.request(`/api/environments/${env.id}`)).state, {
          timeout: 60000,
        })
        .toBe("ready")
      const before = await server.request(`/api/environments/${env.id}`)
      server.child.kill("SIGKILL")
      expect((await server.exited)[1]).toBe("SIGKILL")
      // The observed writer exit makes removing this test-owned lock safe.
      await rm(join(data, ".writer.lock"))
      server = await launch()
      const after = await server.request(`/api/environments/${env.id}`)
      expect(after.state).toBe("stopped")
      expect(after.id).toBe(before.id)
      expect(after.inputDigest).toBe(before.inputDigest)
      expect(
        (await execa("docker", ["ps", "-aq", "--filter", `label=io.redpact.environment=${env.id}`]))
          .stdout,
      ).toBe("")
      await expect
        .poll(async () => (await server.request(`/api/environments/${env.id}`)).state, {
          timeout: 30000,
        })
        .toBe("stopped")
      await writeFile(composePath, compose.replace("[CMD, 'true']", "[CMD, 'false']"))
      const { environment: pending } = await server.request(
        `/api/projects/${project.id}/test-container/start`,
        {},
      )
      await expect
        .poll(
          async () =>
            (
              await execa("docker", [
                "ps",
                "-q",
                "--filter",
                `label=io.redpact.environment=${pending.id}`,
              ])
            ).stdout,
          { timeout: 30000 },
        )
        .toBeTruthy()
      server.child.kill("SIGKILL")
      await server.exited
      // The test observed the writer exit; this is not automatic stale-lock stealing.
      await rm(join(data, ".writer.lock"))
      server = await launch()
      const recovered = await server.request(`/api/environments/${pending.id}`)
      expect(recovered.state).toBe("stopped")
      expect(recovered.id).toBe(pending.id)
      await expect
        .poll(async () => (await server.request(`/api/environments/${pending.id}`)).state, {
          timeout: 30000,
        })
        .toBe("stopped")
      await new Promise((resolve) => setTimeout(resolve, 1500))
      expect(
        (
          await execa("docker", [
            "ps",
            "-aq",
            "--filter",
            `label=io.redpact.environment=${pending.id}`,
          ])
        ).stdout,
      ).toBe("")
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
      expect(result.exitCode, result.stderr).toBe(0)
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
