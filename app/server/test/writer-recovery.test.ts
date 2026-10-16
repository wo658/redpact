import { spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { openStore } from "../src/adapters/storage/files.js"

const directories: string[] = []
function directory() {
  const path = mkdtempSync(join(tmpdir(), "redpact-writer-recovery-"))
  directories.push(path)
  return path
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

async function deadPid() {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" })
  await once(child, "exit")
  return child.pid as number
}

test("dead writer recovery preserves owner metadata and existing evidence", async () => {
  const path = directory()
  const original = JSON.stringify({ pid: await deadPid(), startedAt: new Date().toISOString() })
  writeFileSync(join(path, ".writer.lock"), original)
  writeFileSync(join(path, "evidence.txt"), "retained evidence")
  let storage: ReturnType<typeof openStore> | undefined
  try {
    expect(() => {
      storage = openStore(path)
    }).not.toThrow()
    expect(readFileSync(join(path, "evidence.txt"), "utf8")).toBe("retained evidence")
    const backups = readdirSync(path).filter((name) => name.startsWith(".writer.lock.stale-"))
    expect(backups).toHaveLength(1)
    expect(readFileSync(join(path, backups[0]), "utf8")).toBe(original)
    expect(() => openStore(path)).toThrow("locked")
  } finally {
    storage?.close()
  }
})

test.each([
  "",
  "not-json",
  '{"pid":0}',
  '{"pid":-1}',
  '{"pid":1.5}',
  '{"pid":2147483648}',
  '{"pid":42,"startedAt":"invalid"}',
])("unknown writer metadata is preserved: %j", (source) => {
  const path = directory()
  writeFileSync(join(path, ".writer.lock"), source)
  expect(() => openStore(path)).toThrow("locked")
  expect(readFileSync(join(path, ".writer.lock"), "utf8")).toBe(source)
})

test.each(["EPERM", "EACCES", "EIO"])(
  "an inconclusive process probe (%s) never steals a lock",
  (code) => {
    const path = directory()
    const source = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
    writeFileSync(join(path, ".writer.lock"), source)
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error(code), { code })
    })
    expect(() => openStore(path)).toThrow("locked")
    expect(readFileSync(join(path, ".writer.lock"), "utf8")).toBe(source)
  },
)

test("a failed contender cannot remove the current writer's lock", () => {
  const path = directory()
  const owner = openStore(path)
  try {
    const source = readFileSync(join(path, ".writer.lock"), "utf8")
    expect(() => openStore(path)).toThrow("locked")
    expect(readFileSync(join(path, ".writer.lock"), "utf8")).toBe(source)
  } finally {
    owner.close()
  }
  expect(existsSync(join(path, ".writer.lock"))).toBe(false)
})

test("simultaneous recovery after a killed writer admits exactly one process", async () => {
  const path = directory()
  const module = new URL("../dist/adapters/storage/files.js", import.meta.url).href
  const source = `import {openStore} from ${JSON.stringify(module)};
process.on('message', () => { try { const storage = openStore(process.argv[1]);
process.send({ acquired: true }); process.on('disconnect', () => { storage.close(); process.exit(0) });
} catch (error) { process.send({ acquired: false, error: String(error) }); process.disconnect(); } });`
  const launch = () =>
    spawn(process.execPath, ["--input-type=module", "-e", source, path], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    })
  const original = launch()
  const originalExit = once(original, "exit")
  const ready = once(original, "message")
  original.send("start")
  expect((await ready)[0]).toEqual({ acquired: true })
  original.kill("SIGKILL")
  await originalExit
  const contenders = Array.from({ length: 6 }, launch)
  const exits = contenders.map((child) => once(child, "exit"))
  try {
    const replies = contenders.map((child) => once(child, "message"))
    for (const child of contenders) {
      child.send("start")
    }
    const results = (await Promise.all(replies)).map(
      ([message]) => message as { acquired: boolean },
    )
    expect(results.filter((result) => result.acquired)).toHaveLength(1)
  } finally {
    for (const child of contenders) {
      if (child.connected) {
        child.disconnect()
      }
    }
    await Promise.all(exits)
  }
  expect(existsSync(join(path, ".writer.lock"))).toBe(false)
}, 15000)

test("a reused live PID remains blocked even when its recorded start is old", () => {
  const path = directory()
  const source = JSON.stringify({ pid: process.pid, startedAt: "2000-01-01T00:00:00.000Z" })
  writeFileSync(join(path, ".writer.lock"), source)
  expect(() => openStore(path)).toThrow("owner_pid_alive_or_reused")
  expect(readFileSync(join(path, ".writer.lock"), "utf8")).toBe(source)
})
