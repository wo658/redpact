import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { node, target } from "./target"

/** 데스크톱 부모가 실행한 서버는 실제 웹 화면을 제공하고 종료 시 쓰기 잠금을 해제한다. */
test("데스크톱 실행 경로가 웹 화면과 정상 종료를 함께 제공한다", async (context) => {
  const step = createSteps(context)
  const data = `/tmp/redpact-desktop-e2e-${randomUUID()}`
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      "REDPACT_DESKTOP_CONTROL=1",
      await target(),
      "node",
      "/app/app/server/dist/cli.js",
      "serve",
      "--data-dir",
      data,
      "--port",
      "0",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  )
  const exited = once(child, "exit")
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })
  const readiness = () =>
    output
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .find((value) => value?.desktop === "ready")
  try {
    const port = await step(
      "관리형 컨테이너의 CLI가 부모 파이프와 준비 완료 주소를 제공한다",
      async () => {
        await expect.poll(() => readiness()?.port, { timeout: 10000 }).toBeGreaterThan(0)
        return readiness().port as number
      },
    )
    const page = await step("준비된 서버에서 실제 웹 엔트리를 요청한다", () =>
      node<{ status: number; html: string }>(
        `
      const response = await fetch('http://127.0.0.1:' + JSON.parse(process.argv[1]) + '/');
      console.log(JSON.stringify({status:response.status, html:await response.text()}));
    `,
        port,
      ),
    )
    await step("데스크톱에서 사용하는 React 웹 엔트리가 포함되어 있다", () => {
      // 로컬 서버가 실제 웹 UI까지 제공해야 한다.
      expect(page.status).toBe(200)
      expect(page.html).toContain('<div id="root">')
    })
    await step("부모의 종료 요청으로 서버가 정상 종료한다", async () => {
      child.stdin.write("shutdown\n")
      await expect.poll(() => child.exitCode, { timeout: 5000 }).toBe(0)
    })
    await step("서버 종료 후 데이터 쓰기 잠금이 해제된다", async () => {
      const locked = await node<boolean>(
        `
        import {existsSync} from 'node:fs';
        console.log(JSON.stringify(existsSync(JSON.parse(process.argv[1]) + '/.writer.lock')));
      `,
        data,
      )
      expect(locked).toBe(false)
    })
  } finally {
    child.stdin.end()
    await exited
    await node(
      `import {rm} from 'node:fs/promises'; await rm(JSON.parse(process.argv[1]), {recursive:true, force:true}); console.log('null');`,
      data,
    )
  }
})
