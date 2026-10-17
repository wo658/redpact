import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { node } from "./target"

type CliResult<T> = {
  exit: number
  payload: { version: number; ok: boolean; data: T; error?: { code: string } }
}
type Settings = {
  revision: string | null
  exists: boolean
  value: Record<string, unknown> | null
  redaction: string
}

async function cli<T = Record<string, unknown>>(args: string[], stdin = "") {
  return node<CliResult<T>>(
    `
    import {spawnSync} from 'node:child_process';
    const {args,stdin}=JSON.parse(process.argv[1]);
    const result=spawnSync(process.execPath, [
      '/app/app/server/dist/cli.js', '--server', 'http://127.0.0.1:54318',
      ...args, '--json'
    ], {encoding:'utf8',input:stdin,timeout:20000});
    if(result.error) throw result.error;
    console.log(JSON.stringify({exit:result.status,payload:JSON.parse(result.stdout)}));
    `,
    { args, stdin },
  )
}

function succeeded<T>(result: CliResult<T>) {
  expect(result.exit).toBe(0)
  expect(result.payload).toMatchObject({ version: 1, ok: true })
  return result.payload.data
}

test("CLI가 설정 파일 직접 접근 없이 공유 설정과 프로젝트를 관리한다", async (context) => {
  const step = createSteps(context)
  const path = await step("설정 파일이 없는 실제 프로젝트 디렉터리를 준비한다", () =>
    node<string>(`
      import {mkdtempSync} from 'node:fs';
      console.log(JSON.stringify(mkdtempSync('/tmp/agent-cli-')));
    `),
  )
  const target = ["--scope", "project", "--path", path]
  const initial = await step(
    "스키마 조회와 상태 조회는 설정이나 연결을 생성하지 않는다",
    async () => {
      const description = succeeded(await cli(["settings", "describe", ...target]))
      expect(description.operations).toEqual(["add", "replace", "remove", "test"])
      expect(description.schema).toBeTypeOf("object")
      const settings = succeeded(await cli<Settings>(["settings", "get", ...target]))
      expect(settings).toMatchObject({
        exists: false,
        revision: null,
        value: null,
        redaction: "none",
      })
      const status = succeeded(await cli(["workspace", "status", "--path", path]))
      expect(status.projectRoot).toBe(path)
      expect(status.observedBinding).toBeNull()
      return settings
    },
  )
  expect(initial.revision).toBeNull()
  const created = await step(
    "명시적 생성과 stdin 패치로 설정을 저장하고 형제 값을 보존한다",
    async () => {
      succeeded(
        await cli(
          ["settings", "patch", ...target, "--create", "--patch-stdin"],
          JSON.stringify([
            { op: "add", path: "/tests", value: { timeoutMs: 10000, env: { KEEP: "retained" } } },
          ]),
        ),
      )
      const before = succeeded(await cli<Settings>(["settings", "get", ...target]))
      expect(before.revision).toBeTypeOf("string")
      const subtree = succeeded(
        await cli<Settings>(["settings", "get", ...target, "--pointer", "/tests/env"]),
      )
      expect(subtree.revision).toBe(before.revision)
      expect(subtree.value).toEqual({ KEEP: "retained" })
      succeeded(
        await cli(
          ["settings", "patch", ...target, "--revision", String(before.revision), "--patch-stdin"],
          JSON.stringify([
            { op: "test", path: "/tests/timeoutMs", value: 10000 },
            { op: "replace", path: "/tests/timeoutMs", value: 180000 },
          ]),
        ),
      )
      const after = succeeded(await cli<Settings>(["settings", "get", ...target]))
      expect(after.revision).not.toBe(before.revision)
      expect(after.value).toEqual({ tests: { timeoutMs: 180000, env: { KEEP: "retained" } } })
      return { before, after }
    },
  )
  await step("오래된 revision과 잘못된 후보는 실패하며 저장된 값을 바꾸지 않는다", async () => {
    const stale = await cli([
      "settings",
      "patch",
      ...target,
      "--revision",
      String(created.before.revision),
      "--patch",
      JSON.stringify([{ op: "replace", path: "/tests/timeoutMs", value: 20000 }]),
    ])
    expect(stale.exit).toBe(6)
    expect(stale.payload).toMatchObject({ version: 1, ok: false, error: { code: "CONFLICT" } })
    const invalid = await cli([
      "settings",
      "patch",
      ...target,
      "--revision",
      String(created.after.revision),
      "--patch",
      JSON.stringify([
        { op: "replace", path: "/tests/env/KEEP", value: "must-not-persist" },
        { op: "replace", path: "/tests/timeoutMs", value: -1 },
      ]),
    ])
    expect(invalid.exit).toBe(2)
    expect(invalid.payload.ok).toBe(false)
    expect(succeeded(await cli<Settings>(["settings", "get", ...target]))).toEqual(created.after)
    const validation = succeeded(await cli(["settings", "validate", ...target]))
    expect(validation).toMatchObject({
      valid: true,
      readiness: "not_checked",
      approval: "not_checked",
    })
  })
  await step("프로젝트 연결과 이름 변경은 같은 체크아웃 식별자로 조회된다", async () => {
    const project = succeeded(await cli<{ id: string }>(["projects", "connect", "--path", path]))
    succeeded(
      await cli(["projects", "rename", "--project", project.id, "--name", "CLI acceptance"]),
    )
    const shown = succeeded(await cli(["projects", "show", "--project", project.id]))
    expect(shown).toMatchObject({ id: project.id, name: "CLI acceptance" })
    const status = succeeded(await cli(["workspace", "status", "--path", path]))
    expect(status).toMatchObject({ projectRoot: path, observedBinding: { projectId: project.id } })
    expect(succeeded(await cli<Settings>(["settings", "get", ...target]))).toEqual(created.after)
  })
  await step("승인 정책 패치는 거부하고 기존 인스턴스 설정을 보존한다", async () => {
    let before = succeeded(await cli<Settings>(["settings", "get", "--scope", "instance"]))
    if (!before.exists) {
      succeeded(
        await cli([
          "settings",
          "patch",
          "--scope",
          "instance",
          "--create",
          "--patch",
          JSON.stringify([
            { op: "add", path: "/testResources", value: { memoryMiB: 2048, timeoutSeconds: 600 } },
          ]),
        ]),
      )
      before = succeeded(await cli<Settings>(["settings", "get", "--scope", "instance"]))
    }
    expect(before.revision).toBeTypeOf("string")
    const protectedWrite = await cli([
      "settings",
      "patch",
      "--scope",
      "instance",
      "--revision",
      String(before.revision),
      "--patch",
      JSON.stringify([
        { op: "add", path: "/approval", value: before.value?.approval === "ask" ? "auto" : "ask" },
      ]),
    ])
    expect(protectedWrite.exit).toBe(2)
    expect(protectedWrite.payload.ok).toBe(false)
    expect(succeeded(await cli<Settings>(["settings", "get", "--scope", "instance"]))).toEqual(
      before,
    )
  })
  await step("잘못된 실행 요청과 일반 파일·Git 명령은 실행 없이 거부한다", async () => {
    for (const args of [
      ["tests", "run", "--kind", "playwright", "--path", path],
      ["files", "read", "--file", "package.json"],
      ["git", "status"],
    ]) {
      const result = await cli(args)
      expect(result.exit).toBe(2)
      expect(result.payload).toMatchObject({
        version: 1,
        ok: false,
        error: { code: "INVALID_INPUT" },
      })
    }
    const history = succeeded(await cli(["runs", "list", "--path", path]))
    expect(history.items).toEqual([])
  })
}, 90000)
