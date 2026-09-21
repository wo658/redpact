import { execFileSync, spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

test.skipIf(process.env.REDPACT_PACKAGE_TEST !== "1")(
  "the installed tarball preserves Compose retention and runs tests through the public CLI",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "redpact-installed-"))
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
    const tarball = fileURLToPath(
      new URL(`../../../dist/redpact-${manifest.version}.tgz`, import.meta.url),
    )
    const token = "redpact-package-smoke-token-with-32-characters"
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    }
    const project = join(directory, "project")
    const data = join(directory, "state")
    let stop: (() => Promise<void>) | undefined
    try {
      await writeFile(join(directory, "package.json"), JSON.stringify({ private: true }))
      execFileSync("pnpm", ["add", tarball, "--ignore-scripts", "--ignore-workspace"], {
        cwd: directory,
        encoding: "utf8",
        timeout: 120000,
      })
      const installed = join(directory, "node_modules/redpact")
      const published = JSON.parse(await readFile(join(installed, "package.json"), "utf8"))
      expect(published).toMatchObject({
        name: "redpact",
        private: false,
        bin: { redpact: "dist/cli.js" },
        publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
        repository: { type: "git", url: "git+https://github.com/wo658/redpact.git" },
      })
      expect(published.scripts).toBeUndefined()
      expect(published.devDependencies).toBeUndefined()
      const contents = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n")
      expect(contents).toContain("package/dist/adapters/environment/compose-worker.js")
      expect(contents).toContain("package/dist/adapters/test-runner/reporter.mjs")
      for (const asset of ["worker.js", "Dockerfile", "package.json", "pnpm-lock.yaml"]) {
        expect(contents).toContain(`package/dist/adapters/test-runner/${asset}`)
      }
      expect(contents).toContain("package/dist/runtime-lock.yaml")
      expect(contents).toContain("package/LICENSE")
      expect(contents).toContain("package/NOTICE")
      expect(published.dependencies.vite).toBeUndefined()
      expect(contents).toContain("package/dist/adapters/playwright/worker.js")
      expect(contents).toContain("package/dist/adapters/playwright/reporter.mjs")
      expect(contents).toContain("package/dist/adapters/playwright/Dockerfile")
      expect(published.dependencies["@vitejs/plugin-react"]).toBeUndefined()
      expect(contents).toContain("package/dist/ui/index.html")
      expect(contents).toContain("package/dist/ui/licenses/shadcn-ui.txt")
      expect(contents.some((path) => /^package\/(src|test|app|\.redpact|\.git)\//.test(path))).toBe(
        false,
      )

      // Exercise the shipped patch without Docker, using a failing Compose transport.
      const retention = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
        import { createRequire } from 'node:module';
        const require = createRequire(${JSON.stringify(join(installed, "package.json"))});
        const tc = createRequire(require.resolve('testcontainers/package.json'));
        const composeModule = tc('docker-compose');
        const compose = composeModule.default ?? composeModule;
        compose.upAll = async () => { throw new Error('expected compose failure'); };
        const { getComposeClient } = tc('./build/container-runtime/clients/compose/compose-client.js');
        let removals = 0;
        const client = await getComposeClient({});
        client.down = async () => { removals++; };
        const outcomes = [];
        for (const autoCleanup of [false, true]) {
          try { await client.up({ autoCleanup }); }
          catch (error) { outcomes.push({ message: error.message, removals }); }
        }
        console.log(JSON.stringify(outcomes));
      `,
        ],
        { cwd: directory, encoding: "utf8" },
      )
      expect(JSON.parse(retention)).toEqual([
        { message: "expected compose failure", removals: 0 },
        { message: "expected compose failure", removals: 1 },
      ])

      await mkdir(project)
      const launch = async () => {
        const child = spawn(
          join(directory, "node_modules/.bin/redpact"),
          ["serve", "--project", project, "--data-dir", data, "--port", "0"],
          {
            cwd: directory,
            env: { ...process.env, REDPACT_TOKEN: token },
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
        stop = async () => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGTERM")
          }
          expect((await exit)[0], output).toBe(0)
        }
        await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 15000 }).toBeTruthy()
        return `http://127.0.0.1:${/"port":(\d+)/.exec(output)?.[1]}`
      }
      let base = await launch()
      const ui = await fetch(base)
      expect(ui.status).toBe(200)
      const uiHtml = await ui.text()
      expect(uiHtml).toContain('<div id="root">')
      for (const [, path] of uiHtml.matchAll(/(?:src|href)="(\/[^" ]+)"/g)) {
        expect((await fetch(`${base}${path}`)).status, path).toBe(200)
      }
      const specResponse = await fetch(`${base}/openapi.json`)
      expect(specResponse.status).toBe(200)
      const spec = await specResponse.json()
      expect(spec.paths).toHaveProperty("/api/worktrees/{id}/git")
      expect(spec.paths).not.toHaveProperty("/api/workspaces/{id}/git")
      for (const page of ["/redoc", "/swagger"]) {
        const docs = await fetch(`${base}${page}`)
        expect(docs.status).toBe(200)
        const html = await docs.text()
        expect(html).not.toContain(token)
        for (const [, path] of html.matchAll(/(?:src|href)="(\/docs\/assets\/[^" ]+)"/g)) {
          const asset = await fetch(`${base}${path}`)
          expect(asset.status).toBe(200)
          expect((await asset.text()).length).toBeGreaterThan(50)
        }
      }
      const request = async (path: string, body?: unknown) => {
        const response = await fetch(`${base}${path}`, {
          headers,
          method: body === undefined ? "GET" : "POST",
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const json = await response.json()
        expect(response.ok, JSON.stringify(json)).toBe(true)
        return json
      }
      expect((await fetch(`${base}/api/health`)).status).toBe(200)
      const describe = await request("/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "configure", arguments: { action: "describe" } },
      })
      expect(describe.result.structuredContent.specification.path).toBe(".redpact/settings.json")
      expect(JSON.parse(await readFile(join(project, ".redpact/settings.json"), "utf8"))).toEqual({
        composeFiles: [],
        services: [],
        dependencies: {},
        tests: { directory: "integration", timeoutMs: 10000, env: {} },
      })
      await writeFile(
        join(project, "compose.yaml"),
        JSON.stringify({
          services: {
            app: {
              image: "node:24-alpine",
              command: [
                "node",
                "-e",
                "require('http').createServer((q,s)=>s.end('packaged-runtime')).listen(3000,'0.0.0.0')",
              ],
              ports: [3000],
              healthcheck: {
                test: [
                  "CMD",
                  "node",
                  "-e",
                  "fetch('http://127.0.0.1:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
                ],
                interval: "1s",
                timeout: "2s",
                retries: 30,
              },
            },
          },
        }),
      )
      await writeFile(
        join(project, ".redpact/settings.json"),
        JSON.stringify({
          composeFiles: ["compose.yaml"],
          dependencies: {},
          tests: { env: { APP_URL: { service: "app", port: 3000, scheme: "http" } } },
          services: ["app"],
        }),
      )
      const validation = await request("/mcp", {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "configure", arguments: { action: "validate" } },
      })
      expect(validation.result.isError).not.toBe(true)
      const configured = await request("/api/settings")
      expect(configured.valid).toBe(true)
      const work = await request("/api/work-items", { intent: "Verify installed runtime" })
      const submission = await request(`/api/work-items/${work.id}/submissions`, {
        files: [
          {
            path: "smoke.test.ts",
            source:
              "import {test,expect} from 'vitest'; test('packaged endpoint',async()=>expect(await (await fetch(process.env.APP_URL)).text()).toBe('packaged-runtime'))",
          },
        ],
      })
      let runId: string | undefined
      if (process.env.REDPACT_DOCKER_TESTS === "1") {
        const environments: string[] = []
        for (let i = 0; i < 2; i++) {
          const run = await request("/api/runs", { submissionId: submission.id })
          runId = run.id
          await expect
            .poll(async () => (await request(`/api/runs/${run.id}`)).state, { timeout: 180000 })
            .toBe("finished")
          const result = await request(`/api/runs/${run.id}`)
          expect(result.result.outcome).toBe("passed")
          environments.push(result.environmentId)
          await expect
            .poll(async () => (await request(`/api/environments/${result.environmentId}`)).state, {
              timeout: 30000,
            })
            .toBe("stopped")
        }
        expect(environments[0]).not.toBe(environments[1])
      }
      const identity = await readFile(join(data, "instance.json"), "utf8")
      await stop?.()
      base = await launch()
      expect((await request(`/api/submissions/${submission.id}`)).digest).toBe(submission.digest)
      if (runId) {
        expect((await request(`/api/runs/${runId}`)).result.outcome).toBe("passed")
      }
      expect(await readFile(join(data, "instance.json"), "utf8")).toBe(identity)
    } finally {
      await stop?.()
      await rm(directory, { recursive: true, force: true })
    }
  },
  360000,
)
