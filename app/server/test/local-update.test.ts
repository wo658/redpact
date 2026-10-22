import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, expect, test, vi } from "vitest"
import {
  archiveStoppedWriter,
  assertIdle,
  preflightRuntime,
  switchRuntime,
  verifyServer,
} from "../tools/local-update.js"

const directories: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "redpact-update-"))
  directories.push(root)
  const runtime = join(root, "runtime")
  const candidate = join(root, "candidate")
  const backup = join(root, "previous")
  await mkdir(runtime)
  await mkdir(candidate)
  await writeFile(join(runtime, "version"), "old")
  await writeFile(join(candidate, "version"), "new")
  await writeFile(join(root, "evidence"), "preserve")
  return { root, runtime, candidate, backup }
}
test("plugin-only updates keep MCP and skill metadata on the plugin port despite the development service port", async () => {
  const { root } = await fixture()
  const repository = fileURLToPath(new URL("../../../", import.meta.url))
  await mkdir(join(root, ".agents/plugins"), { recursive: true })
  await writeFile(
    join(root, ".agents/plugins/marketplace.json"),
    JSON.stringify({
      name: "personal",
      plugins: [{ name: "redpact", source: { source: "local", path: "./plugins/redpact" } }],
    }),
  )
  const target = join(root, "plugins/redpact")
  await cp(join(repository, "plugins/redpact"), target, { recursive: true })
  const service = join(root, "service")
  await mkdir(join(service, "data"), { recursive: true })
  const settings = JSON.stringify({ server: { port: 54320 } })
  await writeFile(join(service, "data/settings.json"), settings)
  await mkdir(join(root, "bin"))
  const python = join(root, "bin/python3")
  await writeFile(
    python,
    `#!${process.execPath}\nif (process.argv[2].endsWith("read_marketplace_name.py")) { console.log("personal") }\n`,
  )
  await chmod(python, 0o755)
  const codex = join(root, "bin/codex")
  await writeFile(
    codex,
    `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)))\n`,
  )
  await chmod(codex, 0o755)
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      join(repository, "app/server/tools/local-update.ts"),
      "--plugin-only",
      "--install-dir",
      service,
    ],
    {
      env: {
        ...process.env,
        HOME: root,
        CODEX_HOME: join(root, ".codex"),
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
      },
    },
  )
  const config = JSON.parse(await readFile(join(target, ".mcp.json"), "utf8"))
  expect(config.mcpServers.redpact.url).toBe("http://127.0.0.1:54321/mcp")
  expect(await readFile(join(target, "skills/redpact/agents/openai.yaml"), "utf8")).toContain(
    'url: "http://127.0.0.1:54321/mcp"',
  )
  expect(stdout).toContain('["plugin","add","redpact@personal","--json"]')
  expect(await readFile(join(service, "data/settings.json"), "utf8")).toBe(settings)
})
test("switches to an isolated install and preserves the previous directory and evidence", async () => {
  const paths = await fixture()
  const events: string[] = []
  await switchRuntime({
    ...paths,
    idle: async () => {
      events.push("idle")
    },
    stop: async () => {
      events.push("stop")
    },
    start: async () => {
      events.push(await readFile(join(paths.runtime, "version"), "utf8"))
    },
    verify: async () => {
      events.push("verify")
    },
  })
  expect(await readFile(join(paths.runtime, "version"), "utf8")).toBe("new")
  expect(await realpath(paths.runtime)).toBe(await realpath(paths.candidate))
  expect(await readFile(join(paths.backup, "version"), "utf8")).toBe("old")
  expect(await readFile(join(paths.root, "evidence"), "utf8")).toBe("preserve")
  expect(events).toEqual(["idle", "stop", "idle", "new", "verify"])
})
test("restores and verifies the old install after a failed candidate health check", async () => {
  const paths = await fixture()
  const starts: string[] = []
  await expect(
    switchRuntime({
      ...paths,
      idle: async () => {},
      stop: async () => {},
      start: async () => {
        starts.push(await readFile(join(paths.runtime, "version"), "utf8"))
      },
      verify: async () => {
        if (starts.at(-1) === "new") {
          throw new Error("health failed")
        }
      },
    }),
  ).rejects.toThrow("health failed")
  expect(starts).toEqual(["new", "old"])
  expect(await readFile(join(paths.runtime, "version"), "utf8")).toBe("old")
})
test("does not stop or replace a busy server", async () => {
  const paths = await fixture()
  const stop = vi.fn(async () => {})
  await expect(
    switchRuntime({
      ...paths,
      stop,
      idle: async () => {
        throw new Error("run is active")
      },
      start: async () => {},
      verify: async () => {},
    }),
  ).rejects.toThrow("run is active")
  expect(stop).not.toHaveBeenCalled()
  expect(await readFile(join(paths.runtime, "version"), "utf8")).toBe("old")
})

test("reads active runs and environment operations without modifying evidence", async () => {
  const { root } = await fixture()
  await mkdir(join(root, "runs/r1"), { recursive: true })
  const path = join(root, "runs/r1/state.json")
  await writeFile(path, JSON.stringify({ version: 1, data: { state: "queued" } }))
  await expect(assertIdle(root)).rejects.toThrow("Run r1")
  await writeFile(path, JSON.stringify({ version: 1, data: { state: "finished" } }))
  await mkdir(join(root, "environments"))
  const environment = join(root, "environments/e1.json")
  await writeFile(environment, JSON.stringify({ version: 1, data: { state: "in_use" } }))
  await expect(assertIdle(root)).rejects.toThrow("Environment e1")
  await writeFile(environment, JSON.stringify({ version: 1, data: { state: "retained" } }))
  await expect(assertIdle(root)).resolves.toBeUndefined()
  expect(await readFile(environment, "utf8")).toContain("retained")
  await writeFile(path, "invalid")
  await expect(assertIdle(root)).rejects.toThrow()
})

test("restarts the previous server if the final idle check refuses the switch", async () => {
  const paths = await fixture()
  const idle = vi
    .fn(async () => {})
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error("busy"))
  const start = vi.fn(async () => {})
  await expect(
    switchRuntime({ ...paths, idle, start, stop: async () => {}, verify: async () => {} }),
  ).rejects.toThrow("busy")
  expect(start).toHaveBeenCalledOnce()
  expect(await readFile(join(paths.runtime, "version"), "utf8")).toBe("old")
})

test("a later failed update restores the previous symlink without removing either release", async () => {
  const paths = await fixture()
  const lifecycle = {
    idle: async () => {},
    stop: async () => {},
    start: async () => {},
    verify: async () => {},
  }
  await switchRuntime({ ...paths, ...lifecycle })
  const candidate = join(paths.root, "second")
  await mkdir(candidate)
  await writeFile(join(candidate, "version"), "bad")
  await expect(
    switchRuntime({
      ...paths,
      ...lifecycle,
      candidate,
      backup: join(paths.root, "previous-second"),
      verify: async () => {
        if ((await readFile(join(paths.runtime, "version"), "utf8")) === "bad") {
          throw new Error("bad release")
        }
      },
    }),
  ).rejects.toThrow("bad release")
  expect(await realpath(paths.runtime)).toBe(await realpath(paths.candidate))
  expect(await readFile(join(paths.backup, "version"), "utf8")).toBe("old")
  expect(await readFile(join(candidate, "version"), "utf8")).toBe("bad")
})

test("archives only the lock belonging to the confirmed stopped process", async () => {
  const { root } = await fixture()
  const child = spawn(process.execPath, ["-e", ""])
  const pid = child.pid
  if (!pid) {
    throw new Error("Child process did not start")
  }
  await once(child, "exit")
  const lock = join(root, ".writer.lock")
  await writeFile(lock, JSON.stringify({ pid: process.pid }))
  await expect(archiveStoppedWriter(root, pid)).rejects.toThrow("owner")
  await expect(archiveStoppedWriter(root, process.pid)).rejects.toThrow("alive")
  const record = JSON.stringify({ pid, startedAt: "saved" })
  await writeFile(lock, record)
  await archiveStoppedWriter(root, pid)
  await expect(readFile(lock)).rejects.toThrow("ENOENT")
  const files = await readdir(root)
  const archived = files.find((file) => file.startsWith(".writer.lock.stopped-"))
  if (!archived) {
    throw new Error("Lock record was not preserved")
  }
  expect(await readFile(join(root, archived), "utf8")).toBe(record)
})

import { execFile, spawn } from "node:child_process"
import { once } from "node:events"

function verificationRuntime(names: string[], toolError = false, html = '<div id="root"></div>') {
  const calls: Array<{ name: string; arguments: unknown }> = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/api/health")) {
        return Response.json({ status: "ok" })
      }
      if (!url.endsWith("/mcp")) {
        return new Response(html)
      }
      const request = JSON.parse(options?.body as string)
      if (request.method === "tools/list") {
        return Response.json({ result: { tools: names.map((name) => ({ name })) } })
      }
      if (request.method === "tools/call") {
        calls.push(request.params)
        return Response.json({ result: { isError: toolError, content: [] } })
      }
      return Response.json({ result: { protocolVersion: "2025-03-26" } })
    }),
  )
  return calls
}

test("로컬 업데이트는 수명 주기 MCP의 읽기 전용 상태로 후보를 검증한다", async () => {
  const calls = verificationRuntime(["redpact_status", "open_redpact", "stop_redpact_server"])
  await expect(verifyServer("http://runtime")).resolves.toBeUndefined()
  expect(calls).toEqual([{ name: "redpact_status", arguments: {} }])
})

test("기존 configure 전용 런타임 검증은 rollback에서만 허용한다", async () => {
  const calls = verificationRuntime(["configure"])
  await expect(verifyServer("http://runtime")).rejects.toThrow("redpact_status")
  expect(calls).toEqual([])
  await expect(verifyServer("http://runtime", true, true)).resolves.toBeUndefined()
  expect(calls).toEqual([{ name: "configure", arguments: { action: "describe" } }])
})

test("현재 상태 도구 실패는 rollback에서도 이전 도구로 우회하지 않는다", async () => {
  const calls = verificationRuntime(["redpact_status", "configure"], true)
  await expect(verifyServer("http://runtime", true, true)).rejects.toThrow("tools/call")
  expect(calls).toEqual([{ name: "redpact_status", arguments: {} }])
})

test("상태 도구가 성공해도 웹 진입점이 없으면 후보 검증에 실패한다", async () => {
  verificationRuntime(["redpact_status"], false, "missing viewer")
  await expect(verifyServer("http://runtime")).rejects.toThrow("web entrypoint")
})

test("실행 이력 마이그레이션 사전 검증이 실패하면 기존 서비스를 멈추거나 교체하지 않는다", async () => {
  const paths = await fixture()
  const stop = vi.fn(async () => {})
  await expect(
    switchRuntime({
      ...paths,
      idle: async () => {},
      preflight: async () => {
        throw new Error("unit-runs/legacy.json: unsupported record version")
      },
      stop,
      start: async () => {},
      verify: async () => {},
    }),
  ).rejects.toThrow("unit-runs/legacy.json")
  expect(stop).not.toHaveBeenCalled()
  expect(await readFile(join(paths.runtime, "version"), "utf8")).toBe("old")
})

test("사전 검증은 실제 후보 마이그레이션을 복사본에서 실행하고 원본에는 완료 이력을 쓰지 않는다", async () => {
  const { root } = await fixture()
  const data = join(root, "data")
  await mkdir(data)
  await writeFile(join(data, "settings.json"), '{"server":{"port":54320}}\n')
  const runtime = fileURLToPath(new URL("../", import.meta.url))
  await preflightRuntime(runtime, data)
  expect(await readdir(data)).toEqual(["settings.json"])
  expect(await readFile(join(data, "settings.json"), "utf8")).toBe('{"server":{"port":54320}}\n')
})

test("지원하지 않는 실행 이력은 사전 검증에서 파일 경로를 보고하고 원본은 변경하지 않는다", async () => {
  const { root } = await fixture()
  const data = join(root, "data")
  await mkdir(join(data, "unit-runs"), { recursive: true })
  const id = "5b0633a2-e936-4325-b6ea-aaf9918ce00a"
  const path = join(data, "unit-runs", `${id}.json`)
  const source = JSON.stringify({ version: 1, id })
  await writeFile(path, source)
  const runtime = fileURLToPath(new URL("../", import.meta.url))
  await expect(preflightRuntime(runtime, data)).rejects.toThrow(`unit-runs/${id}.json`)
  expect(await readFile(path, "utf8")).toBe(source)
  expect(await readdir(data)).toEqual(["unit-runs"])
})
