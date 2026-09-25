import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, expect, test } from "vitest"
import { prepareRunner } from "../src/adapters/environment/runner-worker.js"

const directories: string[] = []
async function worker(source: string) {
  const directory = await mkdtemp(join(tmpdir(), "runner-worker-"))
  directories.push(directory)
  const path = join(directory, "worker.mjs")
  await writeFile(path, source)
  return pathToFileURL(path)
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const options = { timeout: 5000, failure: (stderr: string) => `Preparation failed: ${stderr}` }

test("러너 준비 worker에 JSON 입력을 전달하고 컨테이너 ID를 반환한다", async () => {
  const entry = await worker(`
    let source = ''; for await (const chunk of process.stdin) source += chunk;
    const spec = JSON.parse(source);
    process.stdout.write(JSON.stringify({containerId: spec.id}));
  `)
  await expect(
    prepareRunner(entry, { id: "owned-container" }, new AbortController().signal, options),
  ).resolves.toBe("owned-container")
})

test("준비 실패 진단은 호출자의 마스킹을 거쳐 오류로 전달한다", async () => {
  const entry = await worker("process.stderr.write('private-value'); process.exitCode = 7")
  await expect(
    prepareRunner(entry, {}, new AbortController().signal, {
      ...options,
      failure: (stderr) =>
        `Preparation failed: ${stderr.replaceAll("private-value", "[REDACTED]")}`,
    }),
  ).rejects.toThrow("Preparation failed: [REDACTED]")
})

test("이미 취소된 준비 요청은 worker를 실행하지 않고 취소 이유를 보존한다", async () => {
  const entry = await worker("process.stdout.write(JSON.stringify({containerId:'unexpected'}))")
  const abort = new AbortController()
  const reason = new Error("Cancelled preparation")
  abort.abort(reason)
  await expect(prepareRunner(entry, {}, abort.signal, options)).rejects.toBe(reason)
})

test("준비가 성공해도 컨테이너 ID가 없는 응답은 거부한다", async () => {
  const entry = await worker("process.stdout.write('{}')")
  await expect(prepareRunner(entry, {}, new AbortController().signal, options)).rejects.toThrow(
    "Invalid runner container identity",
  )
})

test("준비 worker에 작업 디렉터리와 명시한 환경만 전달한다", async () => {
  const entry = await worker(`
    process.stdout.write(JSON.stringify({containerId:
      process.cwd() + ':' + process.env.REDPACT_WORKER_TEST + ':' + String(process.env.HOME)}));
  `)
  await expect(
    prepareRunner(entry, {}, new AbortController().signal, {
      ...options,
      cwd: directories.at(-1),
      environment: { REDPACT_WORKER_TEST: "value" },
    }),
  ).resolves.toBe(`${await realpath(new URL(".", entry))}:value:undefined`)
})

test("준비 시간 제한으로 worker를 종료하고 진단을 마스킹한다", async () => {
  const entry = await worker("process.stderr.write('private-value'); setInterval(() => {}, 1000)")
  await expect(
    prepareRunner(entry, {}, new AbortController().signal, {
      timeout: 500,
      failure: () => "Sanitized timeout",
    }),
  ).rejects.toThrow("Sanitized timeout")
})

test("실행 중 취소해도 원래 취소 이유를 반환한다", async () => {
  const entry = await worker("setInterval(() => {}, 1000)")
  const abort = new AbortController()
  const reason = new Error("Cancelled running worker")
  const pending = prepareRunner(entry, {}, abort.signal, options)
  const assertion = expect(pending).rejects.toBe(reason)
  setTimeout(() => abort.abort(reason), 100)
  await assertion
})

test.each(["not-json", "null", '{"containerId":""}', '{"containerId":42}'])(
  "잘못된 worker 응답 %s를 원문 노출 없이 거부한다",
  async (output) => {
    const entry = await worker(`process.stdout.write(${JSON.stringify(output)})`)
    await expect(prepareRunner(entry, {}, new AbortController().signal, options)).rejects.toThrow(
      "Invalid runner container identity",
    )
  },
)

test("출력이 없는 시간 초과도 원인을 전달한다", async () => {
  const entry = await worker("setInterval(() => {}, 1000)")
  await expect(
    prepareRunner(entry, {}, new AbortController().signal, { ...options, timeout: 100 }),
  ).rejects.toThrow("Preparation failed: Runner preparation timed out")
})
