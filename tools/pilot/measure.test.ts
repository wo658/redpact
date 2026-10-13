import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
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
  assert.ok(!args.includes("--approve-for-me"))
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write")
  assert.equal(result.metadata.approvalMode, "sandbox_only")
  assert.ok(!args.some((arg: string) => arg.includes("mcp_servers") || arg.includes("bypass")))
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

test("시간 초과 시 TERM을 무시하는 자손도 종료한 뒤 측정을 반환한다", {
  skip: process.platform === "win32",
}, async (t) => {
  const config = { ...(await fixture(t)), timeoutMs: 400 }
  const marker = join(config.cwd, "descendant.log")
  const pidFile = join(config.cwd, "descendant.pid")
  t.after(async () => {
    try {
      process.kill(Number(await readFile(pidFile, "utf8")), "SIGKILL")
    } catch {}
  })
  const descendant = `const fs=require('node:fs'); process.on('SIGTERM',()=>{}); fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid)); setInterval(()=>fs.appendFileSync(${JSON.stringify(marker)},'x'),20);`
  const result = await measureRun(
    config,
    fake(
      `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'}); setInterval(()=>{},1000);`,
    ),
  )
  assert.equal(result.metadata.timedOut, true)
  const before = await readFile(marker, "utf8")
  assert.ok(before.length > 0)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(
    await readFile(marker, "utf8"),
    before,
    "측정 반환 후 자손이 후보 소스를 변경하면 안 된다",
  )
})

test("설치된 CLI가 실행 인자를 수락하고 모델 호출 전 없는 작업 경로에서 종료한다", {
  skip: process.env.PILOT_CLI_SMOKE !== "1",
}, async (t) => {
  const config = await fixture(t)
  await measureRun(config, fake("console.error(JSON.stringify(process.argv.slice(1)))"))
  const args: string[] = JSON.parse(
    await readFile(join(config.outputDirectory, "stderr.log"), "utf8"),
  )
  args[args.indexOf("-C") + 1] = join(config.cwd, "missing-checkout")
  const result = spawnSync("codex", args, {
    input: "Parser smoke",
    encoding: "utf8",
    timeout: 10000,
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /No such file or directory/)
  assert.doesNotMatch(result.stderr, /cannot be used with|unexpected argument/)
})

test("명시 승인 모드는 자동 검토 플래그만 사용하고 sandbox 인자와 충돌하지 않는다", async (t) => {
  const config = { ...(await fixture(t)), approvalMode: "auto_review" as const }
  const result = await measureRun(
    config,
    fake("console.error(JSON.stringify(process.argv.slice(1)))"),
  )
  const args: string[] = JSON.parse(
    await readFile(join(config.outputDirectory, "stderr.log"), "utf8"),
  )
  assert.ok(args.includes("--approve-for-me"))
  assert.ok(!args.includes("--sandbox"))
  assert.ok(!args.some((arg) => arg.includes("bypass")))
  assert.equal(result.metadata.approvalMode, "auto_review")
})
