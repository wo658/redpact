import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { afterEach, beforeEach, expect, test } from "vitest"
import { snapshotInputs } from "../src/adapters/environment/inputs.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { readProjectEntry } from "../src/adapters/project-files.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createStopEnvironment } from "../src/workflows/stop-environment.js"
import { createTestContainer } from "../src/workflows/test-container.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

let root: string
let projectRoot: string
let storage: ReturnType<typeof openStore>
let worktrees: ReturnType<typeof createTestWorktrees>
let environments: ReturnType<typeof createEnvironments>
let service: ReturnType<typeof createTestContainer>
let stopEnvironment: ReturnType<typeof createStopEnvironment>
let projectId: string
let prepares: number
let stops: number
let stopFails: boolean
const git = (...args: string[]) => execa("git", args, { cwd: projectRoot })
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "redpact-manual-"))
  projectRoot = join(root, "project")
  await mkdir(join(projectRoot, ".redpact"), { recursive: true })
  await writeFile(join(projectRoot, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
  await writeFile(
    join(projectRoot, ".redpact/settings.json"),
    JSON.stringify({ composeFiles: ["compose.yaml"], services: ["app"] }),
  )
  await writeFile(
    join(projectRoot, ".redpact/tracking.json"),
    JSON.stringify({ mainBranch: "main", hideMerged: true }),
  )
  await writeFile(join(projectRoot, "app.txt"), "original")
  await git("init", "-b", "main")
  await git("add", ".")
  await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial")
  storage = openStore(join(root, "state"))
  worktrees = createTestWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
  projectId = (await worktrees.connect(projectRoot)).id
  prepares = 0
  stops = 0
  stopFails = false
  environments = createEnvironments({
    store: storage.store,
    worktrees,
    ownerId: randomUUID(),
    adapter: {
      fingerprint: (root) => snapshotInputs(root),
      prepare: async () => {
        prepares++
      },
      inspect: async () => ({
        runtimeId: "runtime",
        resources: [],
        endpoints: { "app:3000": { host: "127.0.0.1", port: 41234 } },
        healthy: true,
      }),
      stop: async () => {
        stops++
        if (stopFails) {
          throw new Error("cannot stop")
        }
      },
    },
  })
  stopEnvironment = createStopEnvironment({
    environments,
    runs: { unfinished: () => [], cancelAndWait: async () => {} } as never,
  })
  service = createTestContainer({
    readFile: readProjectEntry,
    worktrees,
    projects: worktrees.projects,
    environments,
    stopEnvironment,
    fingerprint: (root) => snapshotInputs(root),
  })
})
afterEach(async () => {
  stopFails = false
  await service.close()
  await environments.close()
  storage.close()
  await rm(root, { recursive: true, force: true })
})
test("기준 브랜치의 깨끗한 코드도 실행하고 수정·되돌리기·커밋을 내용으로 판단한다", async () => {
  expect((await service.inspect(projectId)).environment).toBeNull()
  const first = await service.start(projectId)
  await environments.idle()
  expect(first.target?.branch).toBe("main")
  expect(first.environment?.lifecycle).toBe("manual")
  expect((await service.inspect(projectId)).changed).toBe(false)
  await writeFile(join(projectRoot, "app.txt"), "edited")
  expect((await service.inspect(projectId)).changed).toBe(true)
  expect(prepares).toBe(1)
  expect((await service.start(projectId)).environment?.id).toBe(first.environment?.id)
  await writeFile(join(projectRoot, "app.txt"), "original")
  expect((await service.inspect(projectId)).changed).toBe(false)
  await git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "metadata only",
  )
  expect((await service.inspect(projectId)).changed).toBe(false)
  await writeFile(join(projectRoot, "new.txt"), "untracked")
  const restarted = await service.restart(projectId)
  await environments.idle()
  expect(restarted.environment?.id).not.toBe(first.environment?.id)
  expect(restarted.environment?.projectName).not.toBe(first.environment?.projectName)
  expect(stops).toBe(1)
  expect(prepares).toBe(2)
  expect((await service.inspect(projectId)).changed).toBe(false)
  expect(environments.get(first.environment!.id).state).toBe("stopped")
})
test("기준 브랜치 체크아웃이 사라져도 기존 실행 종료는 가능하고 다른 브랜치로 대체하지 않는다", async () => {
  await service.start(projectId)
  await environments.idle()
  await git("checkout", "-b", "feature")
  const inspection = await service.inspect(projectId)
  expect(inspection.target).toBeNull()
  expect(inspection.issue).toMatch(/main branch/)
  await expect(service.restart(projectId)).rejects.toThrow(/main branch/)
  await service.stop(projectId)
  expect(stops).toBe(1)
  await expect(service.start(projectId)).rejects.toThrow(/main branch/)
})
test("정리 실패 후 재실행을 막고 재시도하며 서버 종료는 수동 환경을 유지한다", async () => {
  await service.start(projectId)
  await environments.idle()
  stopFails = true
  await expect(service.restart(projectId)).rejects.toThrow(/Cleanup failed/)
  expect(prepares).toBe(1)
  expect((await service.inspect(projectId)).environment?.state).toBe("stop_failed")
  stopFails = false
  await service.restart(projectId)
  await environments.idle()
  await service.close()
  expect(environments.temporary()).toHaveLength(1)
  await expect(service.start(projectId)).rejects.toThrow(/shutting down/)
})
test("동시 실행 요청으로 중복 컨테이너를 만들지 않는다", async () => {
  const outcomes = await Promise.allSettled([service.start(projectId), service.start(projectId)])
  await environments.idle()
  expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1)
  expect(prepares).toBe(1)
})

test("기준 브랜치가 연결 워크트리에 있으면 기본 체크아웃 대신 해당 경로를 실행한다", async () => {
  await git("checkout", "-b", "feature")
  const mainRoot = join(root, "main-checkout")
  await git("worktree", "add", mainRoot, "main")
  const state = await service.start(projectId)
  expect(state.target?.projectRoot).toBe(await realpath(mainRoot))
  expect(state.environment?.target.projectRoot).toBe(await realpath(mainRoot))
  expect(state.target?.branch).toBe("main")
})

test("설정 변경과 오류를 표시하되 실행 중인 컨테이너를 자동 교체하지 않는다", async () => {
  await service.start(projectId)
  await environments.idle()
  const path = join(projectRoot, "compose.yaml")
  await writeFile(path, "services:\n  app:\n    image: alpine:latest\n")
  expect((await service.inspect(projectId)).changed).toBe(true)
  await writeFile(path, "services:\n  app:\n    image: alpine:3.21\n")
  expect((await service.inspect(projectId)).changed).toBe(false)
  await writeFile(join(projectRoot, ".redpact/settings.json"), "{")
  const state = await service.inspect(projectId)
  expect(state.changed).toBeNull()
  expect(state.issue).toBeTruthy()
  expect(prepares).toBe(1)
  await service.stop(projectId)
  expect(environments.temporary()).toEqual([])
})

test("정지 중에도 설정의 Compose 파일 목록을 순서대로 표시한다", async () => {
  await writeFile(
    join(projectRoot, "override.yaml"),
    "services:\n  app:\n    environment:\n      MODE: preview\n",
  )
  await writeFile(
    join(projectRoot, ".redpact/settings.json"),
    JSON.stringify({ composeFiles: ["compose.yaml", "override.yaml"] }),
  )
  const state = await service.inspect(projectId)
  expect(state.composeFiles).toEqual(["compose.yaml", "override.yaml"])
  expect(state.environment).toBeNull()
  expect(prepares).toBe(0)
})

test("Compose 미리보기는 기준 브랜치 파일을 읽고 설정 밖 경로를 거부한다", async () => {
  await git("checkout", "-b", "feature")
  const mainRoot = join(root, "main-preview")
  await git("worktree", "add", mainRoot, "main")
  await writeFile(
    join(projectRoot, "compose.yaml"),
    "services:\n  other:\n    image: alpine:latest\n",
  )
  expect(typeof service.composeSource).toBe("function")
  const file = await service.composeSource(projectId, "compose.yaml")
  expect(file).toMatchObject({
    kind: "text",
    path: "compose.yaml",
    content: "services:\n  app:\n    image: alpine:3.21\n",
  })
  await expect(service.composeSource(projectId, "app.txt")).rejects.toThrow(/configured Compose/)
  await expect(service.composeSource(projectId, "../compose.yaml")).rejects.toThrow(
    /configured Compose/,
  )
  expect(prepares).toBe(0)
})

test("워크트리 수동 환경은 격리되며 서버 종료는 기준 브랜치만 유지한다", async () => {
  const branchRoot = join(root, "feature-checkout")
  await git("worktree", "add", "-b", "feature", branchRoot)
  await execa(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-m",
      "feature",
    ],
    { cwd: branchRoot },
  )
  const feature = (await worktrees.listWorktrees(projectId)).find(
    (item) => item.branch === "feature",
  )!
  const main = await service.start(projectId)
  const other = await service.start(projectId, feature.id)
  await environments.idle()
  expect(other.target?.id).toBe(feature.id)
  expect(other.environment?.id).not.toBe(main.environment?.id)
  expect(other.environment?.projectName).not.toBe(main.environment?.projectName)
  await service.close()
  expect(stops).toBe(0)
  expect(environments.temporary()).toHaveLength(2)
  await environments.close()
  expect(stops).toBe(1)
  expect(environments.get(other.environment!.id).state).toBe("stopped")
  expect(environments.get(main.environment!.id).state).toBe("ready")
})

test("메인 생략 시작 중 명시적 메인 워크트리 종료는 같은 작업 잠금으로 거부한다", async () => {
  const main = (await worktrees.listWorktrees(projectId)).find((item) => item.branch === "main")!
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const paused = new Promise<void>((resolve) => {
    entered = resolve
  })
  let first = true
  service = createTestContainer({
    readFile: readProjectEntry,
    worktrees: {
      ...worktrees,
      async resolve(id) {
        if (first) {
          first = false
          entered()
          await gate
        }
        return worktrees.resolve(id)
      },
    },
    projects: worktrees.projects,
    environments,
    stopEnvironment,
    fingerprint: (root) => snapshotInputs(root),
  })
  const starting = service.start(projectId)
  await paused
  try {
    const stopped = await Promise.allSettled([service.stop(projectId, main.id)])
    expect(stopped[0].status).toBe("rejected")
  } finally {
    release()
    await starting
  }
  await environments.idle()
  expect(prepares).toBe(1)
  expect(stops).toBe(0)
})
