import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { measureRun } from "./measure.ts"

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), "redpact-measure-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const promptFile = join(root, "prompt.txt")
  await writeFile(promptFile, "Implement the task")
  return {
    cwd: root,
    promptFile,
    outputDirectory: join(root, "evidence"),
    condition: "A" as const,
    model: "pinned-test-model",
    reasoningEffort: "high",
    timeoutMs: 2000,
  }
}
const fake = (script: string) => ({ command: process.execPath, args: ["-e", script, "--"] })

test("가짜 실행의 사용량과 시간을 저장하고 기존 증거를 덮어쓰지 않는다", async (t) => {
  const config = await fixture(t)
  const result = await measureRun(
    config,
    fake(`process.stdin.resume(); process.stdin.on('end', () => {
    console.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:10,cached_input_tokens:5,output_tokens:2}}));
    console.error(JSON.stringify(process.argv.slice(1)));
  });`),
  )
  assert.equal(result.summary.usage?.totalTokens, 12)
  assert.ok(result.metadata.elapsedMs >= 0)
  assert.equal(result.metadata.exitCode, 0)
  assert.equal(await readFile(join(config.outputDirectory, ".gitignore"), "utf8"), "*\n")
  const args = JSON.parse(await readFile(join(config.outputDirectory, "stderr.log"), "utf8"))
  assert.ok(args.includes("--ephemeral"))
  assert.ok(
    !args.some(
      (arg: string) =>
        arg.includes("mcp_servers") || arg.includes("bypass") || arg === "--approve-for-me",
    ),
  )
  await assert.rejects(measureRun(config, fake("")), { code: "EEXIST" })
})

test("C에서만 MCP를 필수 연결하고 shell 해석을 사용하지 않는다", async (t) => {
  const config = {
    ...(await fixture(t)),
    condition: "C" as const,
    redpactUrl: "http://127.0.0.1:3000/mcp",
  }
  await measureRun(config, fake("console.error(JSON.stringify(process.argv.slice(1)))"))
  const args = JSON.parse(await readFile(join(config.outputDirectory, "stderr.log"), "utf8"))
  assert.ok(args.includes('mcp_servers.redpact.url="http://127.0.0.1:3000/mcp"'))
  assert.ok(args.includes("mcp_servers.redpact.required=true"))
})

test("제한시간 종료와 실행파일 오류는 인프라 실패로 기록한다", async (t) => {
  const config = { ...(await fixture(t)), timeoutMs: 40 }
  const result = await measureRun(config, fake("setInterval(() => {}, 1000)"))
  assert.equal(result.metadata.timedOut, true)
  assert.equal(result.metadata.resourceCleanupVerified, false)
  assert.equal(result.summary.status, "failed")
  assert.equal(result.summary.usage.inputTokens, null)
  const failed = await measureRun(
    { ...config, outputDirectory: join(config.cwd, "missing") },
    { command: join(config.cwd, "not-an-executable") },
  )
  assert.match(failed.metadata.infrastructureError ?? "", /ENOENT/)
})
