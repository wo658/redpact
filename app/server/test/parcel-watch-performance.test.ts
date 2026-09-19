import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { setTimeout as delay } from "node:timers/promises"
import { expect, test } from "vitest"
import { createChangeWatcher } from "../src/adapters/changes/watch.js"

async function populate(root: string, count: number) {
  const paths = Array.from({ length: count }, (_, i) =>
    join(root, `directory-${Math.floor(i / 100)}`, `source-${i}.ts`),
  )
  await Promise.all(
    Array.from({ length: Math.ceil(count / 100) }, (_, i) => mkdir(join(root, `directory-${i}`))),
  )
  // Bound fixture IO so creating a large tree does not exhaust file descriptors.
  await Promise.all(
    Array.from({ length: 32 }, async (_, worker) => {
      for (let i = worker; i < paths.length; i += 32) {
        await writeFile(paths[i], "export const value = 0\n")
      }
    }),
  )
  return paths
}

function collector() {
  const observed = new Set<string>()
  let pending: { paths: Set<string>; resolve: () => void } | undefined
  return {
    observed,
    changed(paths: string[] = []) {
      for (const path of paths) {
        observed.add(path)
        pending?.paths.delete(path)
      }
      if (pending?.paths.size === 0) {
        pending.resolve()
        pending = undefined
      }
    },
    async measure(paths: string[], write: () => Promise<unknown>) {
      observed.clear()
      const complete = new Promise<void>((resolve) => {
        pending = { paths: new Set(paths), resolve }
      })
      const cancellation = new AbortController()
      const started = performance.now()
      try {
        await Promise.race([
          Promise.all([complete, write()]),
          delay(10000, undefined, { signal: cancellation.signal }).then(() => {
            throw new Error(`Change delivery timed out: ${pending?.paths.size} paths missing`)
          }),
        ])
        return performance.now() - started
      } finally {
        cancellation.abort()
        pending = undefined
      }
    },
  }
}

for (const fileCount of [1000, 10000]) {
  test(`파일 ${fileCount.toLocaleString("en-US")}개에서 감시 시작과 변경 전달 시간을 측정한다`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "redpact-parcel-performance-")))
    const watcher = createChangeWatcher()
    const events = collector()
    let failures = 0
    try {
      const fixtureStarted = performance.now()
      const paths = await populate(root, fileCount)
      const fixtureMs = performance.now() - fixtureStarted
      const started = performance.now()
      const subscription = watcher.subscribe(
        [{ path: root, kind: "checkout" }],
        events.changed,
        () => {
          failures++
        },
      )
      await subscription.ready
      const readyMs = performance.now() - started
      const singleChangeMs: number[] = []
      for (let sample = 0; sample < 10; sample++) {
        const path = paths[Math.floor((sample * fileCount) / 10)]
        singleChangeMs.push(
          await events.measure([path], () =>
            writeFile(path, `export const value = ${sample + 1}\n`),
          ),
        )
        expect(events.observed.has(path)).toBe(true)
      }
      const burst = Array.from({ length: 100 }, (_, i) => paths[Math.floor((i * fileCount) / 100)])
      const burstMs = await events.measure(burst, () =>
        Promise.all(burst.map((path) => writeFile(path, "export const value = 100\n"))),
      )
      // Require every changed path, not merely the first notification of a burst.
      expect(burst.every((path) => events.observed.has(path))).toBe(true)
      expect(failures).toBe(0)
      const sorted = [...singleChangeMs].sort((a, b) => a - b)
      console.info(
        "PARCEL_WATCH_PERFORMANCE",
        JSON.stringify({
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          fileCount,
          directoryCount: Math.ceil(fileCount / 100),
          fixtureMs,
          readyMs,
          singleChangeMs,
          singleChangeMedianMs: (sorted[4] + sorted[5]) / 2,
          singleChangeMaxMs: sorted.at(-1),
          burstFileCount: burst.length,
          burstMs,
          deliveryIncludes:
            "file writes, native delivery and the adapter's 100ms coalescing window",
        }),
      )
    } finally {
      await watcher.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60000)
}
