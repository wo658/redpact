import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { parseSettings } from "../src/adapters/settings/json.js"

test.each([60001, 180000, 2147483647])("accepts an Integration timeout of %i ms", (timeoutMs) => {
  const result = parseSettings(JSON.stringify({ tests: { timeoutMs } }), "settings.json")
  expect(result.valid).toBe(true)
  expect(result.settings?.tests.timeoutMs).toBe(timeoutMs)
})

test.each([0, -1, 1.5, 2147483648])("rejects an unsafe Integration timer of %i ms", (timeoutMs) => {
  expect(parseSettings(JSON.stringify({ tests: { timeoutMs } }), "settings.json").valid).toBe(false)
})

test("records effective timeout, elapsed time and interrupted stage from real Vitest failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-timeout-"))
  try {
    await symlink(resolve("node_modules"), join(root, "node_modules"), "dir")
    await writeFile(
      join(root, "timeout.test.ts"),
      `
      import {test, describe, beforeEach} from 'vitest';
      test('waiting for memory', async (context) => {
        await context.annotate(JSON.stringify({id:'wait',name:'Wait for memory',state:'started',startedAt:new Date().toISOString()}), 'redpact-step-v1');
        await new Promise(resolve=>setTimeout(resolve,500));
      });
      describe('hook timeout', () => {
        beforeEach(async()=>{ await new Promise(resolve=>setTimeout(resolve,500)); });
        test('hook never completes',()=>{});
      });
    `,
    )
    const report = join(root, "report.json")
    await writeFile(
      join(root, "vitest.config.mjs"),
      `export default ${JSON.stringify({
        test: {
          root,
          testTimeout: 50,
          hookTimeout: 50,
          reporters: [resolve("src/adapters/test-runner/reporter.mjs")],
        },
      })}`,
    )
    const result = await execa(
      process.execPath,
      [
        resolve("node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        join(root, "vitest.config.mjs"),
      ],
      {
        cwd: root,
        env: { REDPACT_REPORT: report },
        reject: false,
        timeout: 20000,
      },
    )
    expect(result.stderr).toContain("Integration timeout: limit=50ms")
    expect(result.exitCode).toBe(1)
    const parsed = JSON.parse(await readFile(report, "utf8"))
    expect(parsed.cases).toHaveLength(2)
    const failure = parsed.cases[0].errors[0].message
    expect(failure).toContain("limit=50ms")
    expect(failure).toMatch(/elapsed=\d+ms/)
    expect(failure).toContain("stage=test; step=Wait for memory")
    expect(parsed.cases[1].errors[0].message).toContain("stage=hook")
    expect(parsed.cases[1].errors[0].message).toContain("limit=50ms")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30000)

test.each(["beforeAll", "afterAll"])(
  "retains nested %s timeout as an execution error",
  async (hook) => {
    const root = await mkdtemp(join(tmpdir(), "redpact-suite-timeout-"))
    try {
      await symlink(resolve("node_modules"), join(root, "node_modules"), "dir")
      await writeFile(
        join(root, "suite.test.ts"),
        `
      import {test,describe,${hook}} from 'vitest';
      describe('outer',()=>{describe('nested',()=>{
        ${hook}(async()=>{await new Promise(resolve=>setTimeout(resolve,500))});
        test('suite case',()=>{});
      })});
    `,
      )
      const report = join(root, "report.json")
      await writeFile(
        join(root, "vitest.config.mjs"),
        `export default ${JSON.stringify({
          test: {
            root,
            hookTimeout: 30,
            reporters: [resolve("src/adapters/test-runner/reporter.mjs")],
          },
        })}`,
      )
      const result = await execa(
        process.execPath,
        [
          resolve("node_modules/vitest/vitest.mjs"),
          "run",
          "--config",
          join(root, "vitest.config.mjs"),
        ],
        {
          cwd: root,
          env: { REDPACT_REPORT: report },
          reject: false,
          timeout: 20000,
        },
      )
      const parsed = JSON.parse(await readFile(report, "utf8"))
      expect(result.exitCode).toBe(1)
      expect(parsed.errors).toHaveLength(1)
      expect(parsed.collectionErrors).toEqual([])
      expect(parsed.errors[0]).toContain("limit=30ms")
      expect(parsed.errors[0]).toMatch(/elapsed=\d+ms/)
      expect(parsed.errors[0]).toContain("stage=hook")
      expect(result.stderr).toContain("limit=30ms")
      const { classifyReport } = await import("../src/core/results.js")
      expect(classifyReport(parsed, result.exitCode ?? -1).outcome).toBe("execution_error")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  30000,
)
