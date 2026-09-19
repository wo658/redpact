import { randomUUID } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { stringify } from "yaml"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createVitestRunner } from "../src/adapters/test-runner/vitest.js"
import type { TestSelection } from "../src/core/types/settings.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestExecution } from "./helpers/execution.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

dockerTest(
  "dependency modes assembles six-service Compose, resolves host bindings and removes each execution environment",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-modes-docker-"))
    const project = join(root, "project"),
      data = join(root, "data")
    await mkdir(join(project, ".redpact"), { recursive: true })
    await mkdir(join(project, "app"))
    await writeFile(
      join(project, "app/Dockerfile"),
      'FROM node:24-alpine\nENV API_URL=http://invalid.example API_TOKEN=image-default KEEP=image-default\nWORKDIR /app\nCOPY server.mjs .\nCMD ["node","server.mjs"]\n',
    )
    await writeFile(
      join(project, "app/server.mjs"),
      `import http from 'node:http'; http.createServer(async(req,res)=>{try {if(req.url==='/health'){res.end('ok');return} const result=process.env.ROLE==='provider'?'provider':process.env.MODE==='stub'?'stub':await (await fetch(process.env.API_URL)).text();res.end(JSON.stringify({result,url:process.env.API_URL??null,token:process.env.API_TOKEN??null,keep:process.env.KEEP}));}catch(e){res.statusCode=500;res.end(String(e))}}).listen(3000,'0.0.0.0');`,
    )
    const service = {
      build: "./app",
      ports: ["3000"],
      environment: { MODE: "real" },
      healthcheck: {
        test: [
          "CMD",
          "node",
          "-e",
          "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
        ],
        interval: "1s",
        timeout: "2s",
        retries: 30,
      },
    }
    await writeFile(
      join(project, "compose.yaml"),
      stringify({
        services: {
          api: service,
          worker: service,
          payments: {
            ...service,
            environment: { ROLE: "provider" },
            depends_on: { db: { condition: "service_healthy" } },
          },
          mail: { ...service, environment: { ROLE: "provider" } },
          storage: { ...service, environment: { ROLE: "provider" } },
          db: {
            image: "postgres:17-alpine",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: Compose input explicitly backed by a secret reference.
            environment: { POSTGRES_PASSWORD: "${DB_PASSWORD:?required}" },
            healthcheck: {
              test: ["CMD", "pg_isready", "-U", "postgres"],
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
        dependencies: {
          "payments-api": {
            modes: {
              mock: {
                env: {
                  api: { MODE: "stub", API_URL: { unset: true }, API_TOKEN: { unset: true } },
                },
              },
              isolated: {
                services: ["payments"],
                env: {
                  api: {
                    MODE: "http",
                    API_URL: "http://payments:3000",
                    API_TOKEN: { unset: true },
                  },
                },
              },
              remote: { env: { api: { API_TOKEN: { secret: "UNAVAILABLE_REMOTE_TOKEN" } } } },
            },
          },
          "payments-worker": {
            modes: {
              mock: {
                env: {
                  worker: { MODE: "stub", API_URL: { unset: true }, API_TOKEN: { unset: true } },
                },
              },
              isolated: {
                services: ["payments"],
                env: {
                  worker: {
                    MODE: "http",
                    API_URL: "http://payments:3000",
                    API_TOKEN: { unset: true },
                  },
                  db: { POSTGRES_PASSWORD: { secret: "TEST_DB_PASSWORD" } },
                },
              },
            },
          },
        },
        tests: { env: { APP_URL: { service: "api", port: 3000, scheme: "http" } } },
      }),
    )
    const storage = openStore(data),
      secrets: NodeJS.ProcessEnv = {}
    const worktrees = createTestWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const p = await worktrees.connect(project),
      worktree = await worktrees.ensure(p.id, project)
    const environments = createEnvironments({
      store: storage.store,
      worktrees,
      ownerId: randomUUID(),
      adapter: createComposeAdapter(data, secrets),
      secrets,
    })
    const runner = createVitestRunner(data)
    const runs = createTestExecution({
      store: storage.store,
      worktrees,
      environments,
      runner,
      scheduler: createScheduler(),
      settings: createSettingsService(project),
    })
    const submissions = createSubmissions({
      store: storage.store,
      worktrees,
      parse: parseSource,
      runnerVersion: runner.version,
    })
    const work = await submissions.createWork("Verify selected host endpoint", worktree.id)
    const submission = await submissions.submitForWork(work.id, [
      {
        path: "selection.test.ts",
        source: `import {test,expect} from 'vitest'; test('selected API is reachable outside Compose',async()=>{const r=await fetch(process.env.APP_URL); expect(r.ok).toBe(true); expect(await r.json()).toEqual({result:'stub',url:null,token:null,keep:'image-default'});});`,
      },
    ])
    const ids: string[] = []
    try {
      const selections: TestSelection[] = [
        { "payments-api": "mock", "payments-worker": "mock" },
        { "payments-api": "mock", "payments-worker": "isolated" },
        { "payments-api": "isolated", "payments-worker": "isolated" },
      ].map((select) => ({ services: ["api", "worker"], select }))
      for (const [index, selection] of selections.entries()) {
        if (index === 1) {
          secrets.TEST_DB_PASSWORD = randomUUID()
        }
        const validation = await createSettingsService(project).read(selection)
        expect(validation.valid, JSON.stringify(validation.issues)).toBe(true)
        if (!validation.digest) {
          throw new Error("Missing settings identity")
        }
        const env = await environments.prepare(
          worktree.id,
          randomUUID(),
          validation.digest,
          selection,
          randomUUID(),
        )
        ids.push(env.id)
        await environments.idle()
        const state = environments.get(env.id)
        const log = await readFile(
          join(data, "environments", env.id, "preparation.log"),
          "utf8",
        ).catch(() => "")
        expect(state.state, log).toBe("ready")
        expect(
          state.resources
            .filter((r) => r.kind === "container")
            .map((r) => r.service)
            .sort(),
        ).toEqual(validation.plan?.activeServices)
        expect(state.selection).toEqual(selection)
        const ep = state.endpoints["api:3000"]
        const response = await fetch(`http://${ep.host}:${ep.port}`)
        expect(response.ok).toBe(true)
        const body = await response.json()
        expect(body.token).toBeNull()
        if (index < 2) {
          expect(body).toEqual({ result: "stub", url: null, token: null, keep: "image-default" })
        } else {
          expect(body.url).toBe("http://payments:3000")
        }
        if (index === 1) {
          const worker = state.endpoints["worker:3000"]
          const body = await (await fetch(`http://${worker.host}:${worker.port}`)).json()
          expect(JSON.parse(body.result).result).toBe("provider")
        }
      }
      expect(new Set(ids.map((id) => environments.get(id).endpoints["api:3000"].port)).size).toBe(3)
      // Finish the isolation probes before allocating the execution environments.
      for (const id of ids) {
        await runs.stopEnvironment(id)
      }
      await runs.stopEnvironment.idle()
      expect(ids.every((id) => environments.get(id).state === "stopped")).toBe(true)

      for (let i = 0; i < 2; i++) {
        const run = await runs.start(submission.id, selections[0])
        await expect.poll(() => runs.get(run.id).state, { timeout: 15000 }).toBe("finished")
        const executed = runs.get(run.id)
        const preparationLog = await readFile(
          join(data, "environments", executed.environmentId!, "preparation.log"),
          "utf8",
        ).catch(() => "")
        expect(
          executed.result?.outcome,
          JSON.stringify({
            result: executed.result,
            environment: environments.get(executed.environmentId!).errors,
            preparationLog,
          }),
        ).toBe("passed")
        await expect
          .poll(() => environments.get(runs.get(run.id).environmentId!).state, { timeout: 30000 })
          .toBe("stopped")
      }
      const reopened = storage.store.getEnvironment(ids[0])
      expect(reopened?.selection).toEqual(selections[0])
      expect(JSON.stringify(reopened)).not.toContain(secrets.TEST_DB_PASSWORD)
    } finally {
      for (const id of ids) {
        await runs.stopEnvironment(id)
        await runs.stopEnvironment.idle()
        expect(environments.get(id).state).toBe("stopped")
      }
      await runs.close()
      await environments.close()
      storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  240000,
)

dockerTest(
  "database jobs run for each execution and named volumes do not leak rows between runs",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-database-")),
      project = join(root, "project"),
      data = join(root, "data")
    await cp(new URL("./fixtures/compose/", import.meta.url), project, { recursive: true })
    await mkdir(join(project, ".redpact"))
    await writeFile(
      join(project, ".redpact/settings.json"),
      JSON.stringify({
        composeFiles: ["compose.yaml"],
        dependencies: {
          database: {
            modes: {
              isolated: {
                services: ["db"],
                env: {
                  db: {
                    POSTGRES_PASSWORD: {
                      secret: "TEST_DB_PASSWORD",
                    },
                  },
                  migrate: {
                    PGPASSWORD: {
                      secret: "TEST_DB_PASSWORD",
                    },
                  },
                  app: {
                    PGPASSWORD: {
                      secret: "TEST_DB_PASSWORD",
                    },
                  },
                },
              },
            },
          },
        },
        tests: {
          env: {
            APP_URL: {
              service: "app",
              port: 3000,
              scheme: "http",
            },
          },
        },
      }),
    )
    const storage = openStore(data),
      secrets = { TEST_DB_PASSWORD: randomUUID() }
    const worktrees = createTestWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const p = await worktrees.connect(project),
      worktree = await worktrees.ensure(p.id, project)
    const environments = createEnvironments({
      store: storage.store,
      worktrees,
      ownerId: randomUUID(),
      adapter: createComposeAdapter(data, secrets),
      secrets,
    })
    const runner = createVitestRunner(data)
    const runs = createTestExecution({
      store: storage.store,
      worktrees,
      environments,
      runner,
      scheduler: createScheduler(),
      settings: createSettingsService(project),
    })
    const submissions = createSubmissions({
      store: storage.store,
      worktrees,
      parse: parseSource,
      runnerVersion: runner.version,
    })
    const work = await submissions.createWork("Verify persisted database state", worktree.id),
      ids: string[] = []
    const selection = { services: ["app"], select: { database: "isolated" } }
    async function execute(source: string) {
      const submission = await submissions.submitForWork(work.id, [
        {
          path: "database.test.ts",
          source: `import {test,expect} from 'vitest'; test('database state',async()=>{${source}});`,
        },
      ])
      const run = await runs.start(submission.id, selection)
      await expect.poll(() => runs.get(run.id).state, { timeout: 90000 }).toBe("finished")
      const environmentId = runs.get(run.id).environmentId!
      ids.push(environmentId)
      expect(runs.get(run.id).result).toMatchObject({ outcome: "passed" })
      const state = environments.get(environmentId)
      expect(state.services).toContainEqual({ name: "migrate", job: true })
      await expect
        .poll(() => environments.get(environmentId).state, { timeout: 30000 })
        .toBe("stopped")
    }
    try {
      await execute(
        "const response=await fetch(process.env.APP_URL,{method:'POST',body:JSON.stringify({id:'record-1',value:'persisted'})});expect(response.ok).toBe(true);expect(await (await fetch(process.env.APP_URL+'/records')).json()).toEqual([{id:'record-1',value:'persisted'}]);",
      )
      await execute(
        "expect(await (await fetch(process.env.APP_URL+'/records')).json()).toEqual([]);",
      )
      expect(ids[0]).not.toBe(ids[1])
    } finally {
      for (const id of ids) {
        await runs.stopEnvironment(id)
        await runs.stopEnvironment.idle()
        expect(environments.get(id).state).toBe("stopped")
      }
      await runs.close()
      await environments.close()
      storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  300000,
)
