import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

const run = vi.hoisted(() => vi.fn())
vi.mock("execa", () => ({ execa: run }))

import { detectInstallation, installRuntime } from "../src/adapters/updates/installation.js"

const roots: string[] = []
afterEach(async () => {
  run.mockReset()
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture(manager: "npm" | "pnpm", development = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "redpact-owner-")))
  roots.push(root)
  const installed = join(root, "node_modules/@wo658/redpact")
  await mkdir(installed, { recursive: true })
  await writeFile(
    join(installed, "package.json"),
    JSON.stringify({ name: "@wo658/redpact", version: "0.2.0" }),
  )
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      [development ? "devDependencies" : "dependencies"]: { "@wo658/redpact": "0.2.0" },
    }),
  )
  await writeFile(join(root, manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml"), "")
  run.mockResolvedValue({ stdout: "/not-the-installation" })
  return { root, installed }
}

test("로컬 npm 설치는 전역 설치로 바꾸지 않고 명시한 버전과 설치 후 버전을 검증한다", async () => {
  const { root, installed } = await fixture("npm")
  const owner = await detectInstallation(installed)
  expect(owner).toMatchObject({ manager: "npm", global: false, cwd: root })
  run.mockImplementation(async (_manager, args) => {
    if (args[0] === "install") {
      await writeFile(
        join(installed, "package.json"),
        JSON.stringify({ name: "@wo658/redpact", version: "0.3.0" }),
      )
    }
    return { stdout: "/not-the-installation" }
  })
  if (!owner) {
    throw new Error("Expected installation owner")
  }
  await installRuntime(owner, "0.3.0")
  expect(run).toHaveBeenCalledWith(
    "npm",
    [
      "install",
      "@wo658/redpact@0.3.0",
      "--ignore-scripts",
      "--registry=https://registry.npmjs.org/",
    ],
    expect.objectContaining({ cwd: root }),
  )
  expect(JSON.parse(await readFile(join(installed, "package.json"), "utf8")).version).toBe("0.3.0")
})

test("pnpm 개발 의존성은 같은 관리자의 개발 의존성으로 유지한다", async () => {
  const { installed } = await fixture("pnpm", true)
  const owner = await detectInstallation(installed)
  expect(owner).toMatchObject({ manager: "pnpm", global: false, development: true })
})

test("npx 캐시와 소유자를 확인할 수 없는 설치는 자동 교체하지 않는다", async () => {
  const { root, installed } = await fixture("npm")
  await rm(join(root, "package-lock.json"))
  expect(await detectInstallation(installed)).toBeNull()
  const cached = join(root, "_npx/node_modules/@wo658/redpact")
  await mkdir(cached, { recursive: true })
  await writeFile(
    join(cached, "package.json"),
    JSON.stringify({ name: "@wo658/redpact", version: "0.2.0" }),
  )
  expect(await detectInstallation(cached)).toBeNull()
})

test("별도 전역 prefix에 프로젝트 manifest가 없어도 실행을 막지 않는다", async () => {
  const { root, installed } = await fixture("npm")
  await rm(join(root, "package.json"))
  await expect(detectInstallation(installed)).resolves.toBeNull()
})
