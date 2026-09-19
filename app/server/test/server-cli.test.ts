import { execFileSync, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { get } from "node:http"
import { networkInterfaces, tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

test.each(["missing", "invalid"])(
  "serve allows configuration with %s settings and releases the writer lock",
  async (state) => {
    const directory = await mkdtemp(join(tmpdir(), "redpact-serve-"))
    await mkdir(join(directory, ".redpact"))
    if (state === "invalid") {
      await writeFile(join(directory, ".redpact/settings.json"), "version: [\n")
    }
    const data = join(directory, "state")

    const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
    const child = spawn(
      process.execPath,
      [cli, "serve", "--project", directory, "--data-dir", data, "--port", "0"],
      { env: { ...process.env, REDPACT_TOKEN: undefined }, stdio: ["ignore", "pipe", "pipe"] },
    )
    const exit = once(child, "exit")
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    try {
      await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 10000 }).toBeTruthy()
      const port = /"port":(\d+)/.exec(output)?.[1]
      const headers = {}
      const publicSpec = await fetch(`http://127.0.0.1:${port}/openapi.json`)
      expect(publicSpec.status).toBe(200)
      expect((await publicSpec.json()).paths["/api/runs"].post.responses).toHaveProperty("202")
      for (const page of ["/redoc", "/swagger"]) {
        const docs = await fetch(`http://127.0.0.1:${port}${page}`)
        expect(docs.status).toBe(200)
        const html = await docs.text()
        expect(html).not.toContain("Bearer ")
        for (const [, path] of html.matchAll(/(?:src|href)="(\/docs\/assets\/[^" ]+)"/g)) {
          const asset = await fetch(`http://127.0.0.1:${port}${path}`)
          expect(asset.status).toBe(200)
          expect((await asset.text()).length).toBeGreaterThan(50)
        }
      }

      const schema = await fetch(`http://127.0.0.1:${port}/api/settings/schema`, { headers })
      expect(schema.status).toBe(200)
      expect((await schema.json()).path).toBe(".redpact/settings.json")
      const validation = await fetch(`http://127.0.0.1:${port}/api/settings`, { headers })
      expect(validation.status).toBe(state === "missing" ? 200 : 422)
      expect((await validation.json()).valid).toBe(state === "missing")
      const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "configure", arguments: { action: "describe" } },
        }),
      })
      expect(mcp.status).toBe(200)
      expect((await mcp.json()).result.structuredContent.specification.path).toBe(
        ".redpact/settings.json",
      )
      child.kill("SIGTERM")
      expect((await exit)[0]).toBe(0)
      expect(existsSync(join(data, ".writer.lock"))).toBe(false)
      expect(existsSync(join(data, "redpact.sqlite"))).toBe(false)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM")
        await exit
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)

test("serve without --project requires worktree selection and still describes settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-multi-"))

  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
      "serve",
      "--data-dir",
      directory,
      "--port",
      "0",
    ],
    {
      env: { ...process.env, REDPACT_TOKEN: undefined },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  const exit = once(child, "exit")
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })
  try {
    await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 10000 }).toBeTruthy()
    const port = /"port":(\d+)/.exec(output)?.[1]
    const headers = {}
    const schema = await fetch(`http://127.0.0.1:${port}/api/settings/schema`, { headers })
    expect(schema.status).toBe(200)
    const settings = await fetch(`http://127.0.0.1:${port}/api/settings`, { headers })
    expect(settings.status).toBe(409)
    expect((await settings.json()).code).toBe("target_required")
    const projects = await fetch(`http://127.0.0.1:${port}/api/projects`, { headers })
    expect(await projects.json()).toEqual([])
    const repository = join(directory, "repository")
    await mkdir(repository)
    execFileSync("git", ["init", "-q", repository])
    execFileSync("git", [
      "-C",
      repository,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-qm",
      "initial",
    ])
    const connected = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ path: repository }),
    })
    expect(connected.status).toBe(201)
    const project = await connected.json()
    const creation = await fetch(`http://127.0.0.1:${port}/api/work-starts`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: randomUUID(),
        projectId: project.id,
        intent: "CLI creation",
        baseRef: "HEAD",
        branch: "codex/cli-test",
        path: join(directory, "created"),
      }),
    })
    expect(creation.status).toBe(200)
    const created = await creation.json()
    expect(created.projectId).toBe(project.id)
    expect(existsSync(join(created.projectRoot, ".git"))).toBe(true)
    const work = await fetch(`http://127.0.0.1:${port}/api/work-items/${created.workItemId}`, {
      headers,
    })
    expect(await work.json()).toMatchObject({
      intent: "CLI creation",
      worktreeId: created.worktreeId,
    })
    child.kill("SIGTERM")
    expect((await exit)[0]).toBe(0)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
      await exit
    }
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test.each([false, true])(
  "컨테이너 수신 옵션 %s에서 실제 네트워크 접속과 요청 경계를 유지한다",
  async (container) => {
    const host = Object.values(networkInterfaces())
      .flat()
      .find((address) => address?.family === "IPv4" && !address.internal)?.address
    expect(host).toBeTruthy()
    const directory = await mkdtemp(join(tmpdir(), "redpact-bind-"))
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
        "serve",
        "--data-dir",
        directory,
        "--port",
        "0",
        ...(container ? ["--host", "0.0.0.0"] : []),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    )
    const exit = once(child, "exit")
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    try {
      await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 10000 }).toBeTruthy()
      const port = /"port":(\d+)/.exec(output)?.[1]
      const request = (headers: Record<string, string>) =>
        new Promise<number>((resolve) => {
          const req = get(
            { hostname: host, port, path: "/api/health", headers, timeout: 2000 },
            (res) => {
              res.resume()
              resolve(res.statusCode ?? 0)
            },
          )
          req.on("error", () => resolve(0))
          req.on("timeout", () => req.destroy())
        })
      expect(await request({ Host: `127.0.0.1:${port}` })).toBe(container ? 200 : 0)
      expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200)
      if (container) {
        expect(await request({ Host: "untrusted.example" })).toBe(403)
        expect(
          await request({ Host: `127.0.0.1:${port}`, Origin: "https://untrusted.example" }),
        ).toBe(403)
        expect(await request({ Host: `127.0.0.1:${port}`, "Sec-Fetch-Site": "cross-site" })).toBe(
          403,
        )
      }
    } finally {
      child.kill("SIGTERM")
      await exit
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)

test.each([
  { host: "192.0.2.1", desktop: false, error: "Allowed choices" },
  { host: "0.0.0.0", desktop: true, error: "Desktop control requires a loopback" },
])(
  "지원하지 않는 수신 설정을 거부한다: $host, desktop=$desktop",
  async ({ host, desktop, error }) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "serve", "--host", host],
      {
        env: { ...process.env, REDPACT_DESKTOP_CONTROL: desktop ? "1" : undefined },
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    let output = ""
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    expect((await once(child, "exit"))[0]).toBe(1)
    expect(output).toContain(error)
  },
)
