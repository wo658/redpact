import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Network } from "testcontainers"
import { expect, test } from "vitest"
import { parseSettings } from "../src/adapters/settings/json.js"
import { createVitestRunner } from "../src/adapters/test-runner/vitest.js"

test.runIf(process.env.REDPACT_DOCKER_TESTS === "1")(
  "설정한 기본 timeout으로 60초 넘는 테스트를 통과시키고 제한 초과 진단을 보존한다",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "timeout-runner-"))
    const network = await new Network().start()
    try {
      const runner = createVitestRunner(directory)
      const settings = parseSettings('{"tests":{"timeoutMs":180000}}', "settings.json").settings
      if (!settings) {
        throw new Error("Expected valid 180000ms Integration settings")
      }
      const execute = (source: string, timeoutMs: number, runId: string) =>
        runner.execute(
          {
            id: randomUUID(),
            workItemId: randomUUID(),
            digest: "timeout-regression",
            runnerVersion: runner.version,
            parsed: [],
            createdAt: new Date().toISOString(),
            files: [{ path: "timeout.test.ts", source }],
          },
          runId,
          new AbortController().signal,
          { tests: { timeoutMs } },
          {},
          [],
          {
            version: 1,
            services: {},
            runtime: {
              ownerId: randomUUID(),
              environmentId: randomUUID(),
              network: network.getName(),
            },
          },
        )
      const passed = await execute(
        `
        import {test,expect} from 'vitest';
        test('60초를 넘긴 기본 제한 실행',async()=>{
          const started=performance.now();
          await new Promise(resolve=>setTimeout(resolve,61000));
          expect(performance.now()-started).toBeGreaterThan(60000);
        });
      `,
        settings.tests.timeoutMs,
        randomUUID(),
      )
      expect(passed, JSON.stringify(passed)).toMatchObject({ outcome: "passed" })
      const failedId = randomUUID()
      const failed = await execute(
        `
        import {test} from 'vitest';
        test('기본 제한 초과',async()=>{await new Promise(resolve=>setTimeout(resolve,1000))});
      `,
        50,
        failedId,
      )
      expect(failed).toMatchObject({ outcome: "execution_error" })
      expect(failed.cases[0]?.errors[0]?.message).toContain("limit=50ms")
      expect(await readFile(join(directory, "runs", failedId, "stderr.log"), "utf8")).toContain(
        "stage=test",
      )
    } finally {
      await network.stop()
      await rm(directory, { recursive: true, force: true })
    }
  },
  240000,
)
