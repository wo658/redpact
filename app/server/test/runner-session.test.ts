import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, expect, test } from "vitest"
import { startRunner } from "../src/adapters/environment/runner-session.js"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function worker(source: string) {
  const directory = await mkdtemp(join(tmpdir(), "runner-session-"))
  directories.push(directory)
  const path = join(directory, "worker.mjs")
  await writeFile(path, source)
  return pathToFileURL(path)
}
const options = { timeout: 3000, failure: (text: string) => `Preparation failed: ${text}` }
test("준비 완료 후에도 러너 핸들을 유지하여 실행과 명시적 정리를 요청할 수 있다", async () => {
  const entry = await worker(`
    for await (const chunk of process.stdin) {}
    if (!process.send) { process.stdout.write(JSON.stringify({containerId:'runner'})); }
    else {
      process.on('message', message => {
        process.send({ requestId: message.requestId, value: message.action === 'execute' ? {stdout:'test output', stderr:'', exitCode:0} : undefined });
        if (message.action === 'stop') process.disconnect();
      });
      process.send({ready:true, containerId:'runner'});
    }
  `)
  const session = await startRunner(entry, {}, new AbortController().signal, options)
  expect(session).toHaveProperty("execute")
  try {
    expect(session.containerId).toBe("runner")
    await expect(
      session.execute(
        ["true"],
        { memoryMiB: 256, timeoutSeconds: 10 },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ stdout: "test output", exitCode: 0 })
  } finally {
    await session.stop()
  }
})

test("준비 실패 stderr를 명령 입력 노출 없이 보존한다", async () => {
  const entry = await worker(
    `process.stderr.write('build failed: missing dependency'); process.exitCode=1; process.disconnect();`,
  )
  const chunks: string[] = []
  await expect(
    startRunner(entry, { secret: "never-print-input" }, new AbortController().signal, {
      ...options,
      diagnostic: (chunk) => chunks.push(chunk.toString()),
    }),
  ).rejects.toThrow("Preparation failed: build failed: missing dependency")
  expect(chunks.join("")).not.toContain("never-print-input")
})

test("실행 취소는 worker를 먼저 죽이지 않고 부분 출력을 회수한 뒤 정리한다", async () => {
  const entry = await worker(`
    let execution;
    process.on('message', message => {
      if (message.action === 'execute') execution=message.requestId;
      if (message.action === 'cancel') process.send({requestId:execution,value:{outcome:'cancelled',stdout:'before cancel',stderr:'',exitCode:null}});
      if (message.action === 'stop') { process.send({requestId:message.requestId}); process.disconnect(); }
    });
    process.send({ready:true,containerId:'runner'});
  `)
  const session = await startRunner(entry, {}, new AbortController().signal, options)
  const abort = new AbortController()
  try {
    const result = session.execute(["test"], { memoryMiB: 256, timeoutSeconds: 10 }, abort.signal)
    abort.abort()
    await expect(result).resolves.toMatchObject({ outcome: "cancelled", stdout: "before cancel" })
  } finally {
    await session.stop()
  }
})

test("준비 제한 시간과 준비 중 취소는 worker를 종료한다", async () => {
  const entry = await worker("process.on('message',()=>{}); setInterval(()=>{},1000)")
  await expect(
    startRunner(entry, {}, new AbortController().signal, { ...options, timeout: 100 }),
  ).rejects.toThrow("timed out")
  const abort = new AbortController()
  const pending = startRunner(entry, {}, abort.signal, options)
  const assertion = expect(pending).rejects.toThrow("cancel preparation")
  abort.abort(new Error("cancel preparation"))
  await assertion
})

test("정리 실패는 성공으로 숨기지 않는다", async () => {
  const entry = await worker(`
    process.on('message', message=>{process.send({requestId:message.requestId,error:'cleanup denied'});process.disconnect()});
    process.send({ready:true,containerId:'runner'});
  `)
  const session = await startRunner(entry, {}, new AbortController().signal, options)
  await expect(session.stop()).rejects.toThrow("cleanup denied")
})

test("worker가 갑자기 종료되어도 이미 스트리밍한 명령 출력을 전달한다", async () => {
  const entry = await worker(`
    process.on('message', message => {
      process.send({requestId:message.requestId,output:{stdout:'before crash',stderr:'failure marker',truncated:false}},()=>process.exit(1));
    });
    process.send({ready:true,containerId:'runner'});
  `)
  const session = await startRunner(entry, {}, new AbortController().signal, options)
  const outputs: unknown[] = []
  await expect(
    session.execute(
      ["test"],
      { memoryMiB: 256, timeoutSeconds: 10 },
      new AbortController().signal,
      (output) => outputs.push(output),
    ),
  ).rejects.toThrow("exited unexpectedly")
  expect(outputs).toEqual([{ stdout: "before crash", stderr: "failure marker", truncated: false }])
})

test("정리 실패를 반환하기 전에 worker 종료와 로그 전달을 완료한다", async () => {
  const entry = await worker(`
    process.on('message', message => {
      process.stderr.write('cleanup diagnostic');
      process.send({requestId:message.requestId,error:'cleanup denied'});
    });
    process.send({ready:true,containerId:String(process.pid)});
  `)
  const session = await startRunner(entry, {}, new AbortController().signal, options)
  await expect(session.stop()).rejects.toThrow("cleanup denied")
  expect(() => process.kill(Number(session.containerId), 0)).toThrow()
})

test("각 실행 worker는 공유 Ryuk 세션을 사용하지 않는다", async () => {
  const entry = await worker(`
    process.on('message', message=>{process.send({requestId:message.requestId});process.disconnect()});
    process.send({ready:true,containerId:String(process.env.TESTCONTAINERS_RYUK_ISOLATED)});
  `)
  const session = await startRunner(entry, {}, new AbortController().signal, {
    ...options,
    environment: { TESTCONTAINERS_RYUK_ISOLATED: "false" },
  })
  try {
    expect(session.containerId).toBe("true")
  } finally {
    await session.stop()
  }
})
