import { spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { expect, test } from "vitest"

const main = fileURLToPath(new URL("../dist/main.js", import.meta.url))
function launch(data: string, preload?: string, supervisedCli = false) {
  const child = spawn(
    process.execPath,
    [
      ...(preload ? ["--import", pathToFileURL(preload).href] : []),
      ...(supervisedCli
        ? [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "serve"]
        : [main]),
      "--data-dir",
      data,
      "--port",
      "0",
    ],
    {
      env: { ...process.env, REDPACT_RUNTIME_SUPERVISED: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  )
  const exit = once(child, "exit")
  let output = ""
  child.stdout?.on("data", (chunk) => {
    output += chunk
  })
  child.stderr?.on("data", (chunk) => {
    output += chunk
  })
  return {
    child,
    exit,
    output: () => output,
    async ready() {
      await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 10000 }).toBeTruthy()
      return `http://127.0.0.1:${/"port":(\d+)/.exec(output)?.[1]}`
    },
  }
}

for (const ending of ["SIGTERM", "SIGKILL", "disconnect", "shutdown"] as const) {
  test(`런타임 ${ending} 이후 같은 데이터로 다시 시작하고 인스턴스 식별자를 보존한다`, async () => {
    const data = await mkdtemp(join(tmpdir(), "redpact-lifecycle-"))
    let runtime = launch(data)
    try {
      await runtime.ready()
      const original = await readFile(join(data, "instance.json"), "utf8")
      if (ending === "disconnect") {
        runtime.child.disconnect()
      } else if (ending === "shutdown") {
        runtime.child.send({ runtimeControl: "shutdown" })
      } else {
        runtime.child.kill(ending)
      }
      await expect
        .poll(() => runtime.child.exitCode !== null || runtime.child.signalCode !== null, {
          timeout: 5000,
        })
        .toBe(true)
      await runtime.exit
      if (ending !== "SIGKILL") {
        expect(existsSync(join(data, ".writer.lock"))).toBe(false)
        expect(runtime.child.exitCode, runtime.output()).toBe(0)
        expect(existsSync(join(data, "runtime-lifecycle.jsonl"))).toBe(true)
        const events = (await readFile(join(data, "runtime-lifecycle.jsonl"), "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        expect(events).toContainEqual(
          expect.objectContaining({
            event: "runtime.shutdown.requested",
            reason: { disconnect: "parent_disconnect", shutdown: "manual", SIGTERM: "SIGTERM" }[
              ending
            ],
          }),
        )
        expect(events).toContainEqual(
          expect.objectContaining({ event: "runtime.shutdown.completed", writer: "released" }),
        )
      }
      runtime = launch(data)
      const origin = await runtime.ready()
      expect((await fetch(`${origin}/api/health`)).status).toBe(200)
      expect(await readFile(join(data, "instance.json"), "utf8")).toBe(original)
    } finally {
      if (runtime.child.exitCode === null && runtime.child.signalCode === null) {
        runtime.child.kill("SIGKILL")
      }
      await runtime.exit
      await rm(data, { recursive: true, force: true })
    }
  }, 25000)
}

test("종료 중 정리 오류가 나도 다른 정리를 수행하고 실패 종료 후 재시작할 수 있다", async () => {
  const data = await mkdtemp(join(tmpdir(), "redpact-shutdown-error-"))
  const preload = join(data, "inject.mjs")
  const completed = join(data, "cleanup-completed")
  // Inject a failed cleanup through Node's test-only module loader, not a product setting.
  await writeFile(
    preload,
    `import {registerHooks} from 'node:module';
registerHooks({load(url, context, next) {
  const result = next(url, context);
  if (url.endsWith('/workflows/runtime-shutdown.js')) {
    return {...result, source: 'import {writeFileSync} from "node:fs";\\n' + String(result.source).replace(
      'for (const step of steps)',
      'for (const step of [{name:"injected failure",close(){throw new Error("injected cleanup error")}}, ...steps, {name:"final evidence",close(){writeFileSync(' + ${JSON.stringify(JSON.stringify(completed))} + ', "done")}}])'
    )};
  }
  return result;
}});`,
  )
  let runtime = launch(data, preload)
  try {
    await runtime.ready()
    runtime.child.send({ runtimeControl: "shutdown" })
    const [code] = await runtime.exit
    expect(code, runtime.output()).toBe(1)
    expect(runtime.output()).toContain("Failed to close injected failure")
    expect(await readFile(completed, "utf8")).toBe("done")
    const diagnostics = await readFile(join(data, "runtime-lifecycle.jsonl"), "utf8")
    expect(diagnostics).toContain('"event":"runtime.shutdown.failed"')
    expect(diagnostics).toContain('"writer":"held_until_exit"')
    expect(diagnostics).toContain("injected cleanup error")
    expect(diagnostics).toContain('"event":"runtime.writer.released"')
    expect(existsSync(join(data, ".writer.lock"))).toBe(false)
    runtime = launch(data)
    await runtime.ready()
  } finally {
    if (runtime.child.exitCode === null && runtime.child.signalCode === null) {
      runtime.child.kill("SIGKILL")
    }
    await runtime.exit
    await rm(data, { recursive: true, force: true })
  }
}, 25000)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`CLI supervisor의 ${signal} 종료 원인이 자식 런타임까지 보존된다`, async () => {
    const data = await mkdtemp(join(tmpdir(), "redpact-supervisor-signal-"))
    const preload = join(data, "installation.mjs")
    // Select the installed supervisor branch without replacing CLI or child lifecycle behavior.
    await writeFile(
      preload,
      `import {registerHooks} from 'node:module';
registerHooks({load(url, context, next) {
  if (url.endsWith('/adapters/updates/installation.js')) return {format:'module',shortCircuit:true,source:
    'export async function detectInstallation(){return {entry:'+${JSON.stringify(JSON.stringify(main))}+'}}; export async function installRuntime(){throw new Error("unexpected installation")}' };
  return next(url, context);
}});`,
    )
    const runtime = launch(data, preload, true)
    try {
      await runtime.ready()
      runtime.child.kill(signal)
      await runtime.exit
      const events = (await readFile(join(data, "runtime-lifecycle.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(events).toContainEqual(
        expect.objectContaining({ event: "supervisor.shutdown.requested", reason: signal }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({ event: "runtime.shutdown.requested", reason: signal }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          event: "runtime.shutdown.completed",
          reason: signal,
          writer: "released",
        }),
      )
    } finally {
      if (runtime.child.exitCode === null && runtime.child.signalCode === null) {
        runtime.child.kill("SIGKILL")
      }
      await runtime.exit
      await rm(data, { recursive: true, force: true })
    }
  }, 25000)
}

test("종료 중인 HTTP 쓰기가 끝나기 전에는 writer 소유권을 해제하지 않는다", async () => {
  const data = await mkdtemp(join(tmpdir(), "redpact-http-drain-"))
  const preload = join(data, "request.mjs")
  const started = join(data, "request-started")
  const release = join(data, "request-release")
  const completed = join(data, "request-completed")
  const injected = `app.get('/test-delayed-write', async () => {
    writeFileSync(${JSON.stringify(started)}, 'started');
    while (!existsSync(${JSON.stringify(release)})) { await new Promise(resolve => setTimeout(resolve, 10)); }
    writeFileSync(${JSON.stringify(completed)}, String(existsSync(${JSON.stringify(join(data, ".writer.lock"))})));
    return new Response('written');
  });`
  await writeFile(
    preload,
    `import {registerHooks} from 'node:module';
registerHooks({load(url, context, next) {
 const result = next(url, context);
 if(url.endsWith('/app.js'))return {...result, source:'import {writeFileSync, existsSync} from "node:fs";\\n'+String(result.source).replace('const app = new Hono();', 'const app = new Hono();'+${JSON.stringify(injected)})};
 return result;
}});`,
  )
  const runtime = launch(data, preload)
  try {
    const origin = await runtime.ready()
    const request = fetch(`${origin}/test-delayed-write`).catch(() => undefined)
    await expect.poll(() => existsSync(started)).toBe(true)
    runtime.child.send({ runtimeControl: "shutdown" })
    await expect
      .poll(async () =>
        (await readFile(join(data, "runtime-lifecycle.jsonl"), "utf8")).includes(
          '"event":"runtime.shutdown.requested"',
        ),
      )
      .toBe(true)
    expect(existsSync(join(data, ".writer.lock"))).toBe(true)
    expect(runtime.child.exitCode).toBeNull()
    expect(existsSync(completed)).toBe(false)
    await writeFile(release, "continue")
    await runtime.exit
    await request
    expect(await readFile(completed, "utf8")).toBe("true")
    expect(existsSync(join(data, ".writer.lock"))).toBe(false)
  } finally {
    if (runtime.child.exitCode === null && runtime.child.signalCode === null) {
      runtime.child.kill("SIGKILL")
    }
    await runtime.exit
    await rm(data, { recursive: true, force: true })
  }
}, 25000)

test("폐기한 데스크톱 환경 변수와 stdin 명령은 감독 런타임의 IPC 수명주기를 바꾸지 않는다", async () => {
  const data = await mkdtemp(join(tmpdir(), "redpact-retired-control-"))
  const child = spawn(process.execPath, [main, "--data-dir", data, "--port", "0"], {
    env: {
      ...process.env,
      REDPACT_RUNTIME_SUPERVISED: "1",
      REDPACT_DESKTOP_CONTROL: "1",
    },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  })
  const exit = once(child, "exit")
  const messages: unknown[] = []
  let output = ""
  child.on("message", (message) => messages.push(message))
  child.stdout?.on("data", (chunk) => {
    output += chunk
  })
  child.stderr?.on("data", (chunk) => {
    output += chunk
  })
  try {
    await expect
      .poll(
        () =>
          messages.find(
            (message) =>
              typeof message === "object" && message !== null && "runtimeReady" in message,
          ),
        { timeout: 10000 },
      )
      .toEqual({ runtimeReady: expect.any(Number) })
    const ready = messages.find(
      (message) => typeof message === "object" && message !== null && "runtimeReady" in message,
    ) as { runtimeReady: number }
    child.stdin?.end("shutdown\n")
    expect((await fetch(`http://127.0.0.1:${ready.runtimeReady}/api/health`)).status).toBe(200)
    expect(child.exitCode).toBeNull()
    expect(output).not.toContain('"desktop":"ready"')
    child.send({ runtimeControl: "shutdown" })
    expect((await exit)[0], output).toBe(0)
    expect(messages).toContainEqual({ runtimeControl: "stopped" })
    expect(existsSync(join(data, ".writer.lock"))).toBe(false)
  } finally {
    child.stdin?.destroy()
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
    }
    await exit
    await rm(data, { recursive: true, force: true })
  }
}, 15000)
